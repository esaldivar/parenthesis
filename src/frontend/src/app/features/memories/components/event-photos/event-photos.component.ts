import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { LoadingIndicator } from '../../../../shared/brand/loading-indicator';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { Api, EventPhoto, EventPhotos, PhotoBatch, PhotoExport } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { Icon } from '../../../../shared/icon/icon';
import { Toasts } from '../../../../shared/toast/toasts';
import {
  ACCEPT,
  PHOTOS_NOW,
  RETENTION_DAYS,
  blockedText,
  canRetry,
  deletedOnIfAddedToday,
  expiry,
  expiryChip,
  familyDate,
  fileProblem,
  shortDate,
  sizeText,
  uploadMessage,
} from '../../photo-text';
import { ExportLine, MemoryExport, exportLine, progressText } from '../../google-photos-export';

/** One chosen file, from checking it to its upload's result. */
interface Pick {
  readonly key: number;
  readonly file: File;
  /** Why it won't be added (checked before uploading, or the server's answer). */
  readonly message: string | null;
  readonly state: 'ready' | 'skipped' | 'waiting' | 'uploading' | 'added' | 'failed';
  /** A failure that trying again might fix (connection trouble), as opposed to a refusal. */
  readonly retry: boolean;
}

/** A batch as shown: its photos' places among all the photos here, for "Photo 2 of 7". */
interface ShownBatch {
  readonly batch: PhotoBatch;
  readonly date: string;
  readonly first: number;
  readonly expiry: string;
}

/**
 * An event's photos (#403): the viewer's own batches with their "Visible to Co-Parent" switch, the co-parent's
 * shared batches, adding photos, viewing, downloading and deleting one. Used in the event details and on a Family
 * Memory's page. Every rule is the server's: this only explains what it allows, and never shows a photo as added
 * until the server says it is. The co-parent's private batches never appear, not even as a count.
 */
@Component({
  selector: 'app-event-photos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, MatSlideToggleModule, RouterLink, Icon, LoadingIndicator],
  providers: [MemoryExport],
  // Escape closes an open photo first, before the event details around it.
  host: { '(keydown.escape)': 'escape($event)' },
  templateUrl: './event-photos.component.html',
  styleUrl: './event-photos.component.scss',
})
export class EventPhotosSection {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly now = inject(PHOTOS_NOW);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly exports = inject(MemoryExport);

  readonly familyId = input.required<string>();
  readonly eventId = input.required<string>();
  readonly timeZone = input.required<string>();
  /** The other parent's name, or null while there isn't one. */
  readonly coParent = input<string | null>(null);
  /** For parenting time: the parent who has the kids then. */
  readonly caregiver = input<string | null>(null);
  /** The event's status on the calendar. Pending and declined events never offer photos. */
  readonly eventStatus = input<string>('confirmed');
  /** In the event details: offers the link to its Family Memory. */
  readonly linkToMemory = input(true);
  /** On a Family Memory's page, for a parent: offers export to their own Google Photos (#404). */
  readonly googlePhotos = input(false);
  /** Heading level inside the page or panel. */
  readonly headingLevel = input<2 | 3>(3);
  /** Each time the photos load, so a page can keep its summary current. */
  readonly loaded = output<EventPhotos>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly accept = ACCEPT;
  protected readonly retentionDays = RETENTION_DAYS;
  protected readonly view = signal<EventPhotos | null>(null);
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly loadError = signal<string | null>(null);

  /** The upload sheet: closed, choosing (checked files, nothing sent), or uploading/done. */
  protected readonly sheet = signal<'closed' | 'review' | 'uploading' | 'done'>('closed');
  protected readonly picks = signal<readonly Pick[]>([]);
  protected readonly offline = signal(false);
  protected readonly uploadPercent = signal<number | null>(null);
  /** The batch this upload adds to; a new one starts when it's missing. */
  private batchId: string | null = null;
  private nextKey = 1;

  /** The photo open in the viewer. */
  protected readonly openPhoto = signal<EventPhoto | null>(null);
  protected readonly confirmingDelete = signal(false);
  /** The batch whose sharing is being turned off, waiting for the parent to confirm. */
  protected readonly confirmingUnshare = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  /** Pending or declined: no photos, and nothing is fetched, so a proposal never looks confirmed. */
  protected readonly notConfirmed = computed(
    () => this.eventStatus() === 'pending' || this.eventStatus() === 'declined',
  );

  protected readonly batches = computed<readonly ShownBatch[]>(() => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const zone = this.timeZone();
    const now = this.now();
    const locale = this.copyLocale.locale();
    let first = 1;
    return view.batches
      .filter((b) => b.photos.length > 0)
      .map((batch) => {
        const soonest = batch.photos.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
        const shown = {
          batch,
          date: shortDate(familyDate(batch.createdAt, this.timeZone()), locale),
          first,
          expiry: expiryChip(expiry(soonest.expiresAt, zone, now, locale), locale),
        };
        first += batch.photos.length;
        return shown;
      });
  });
  protected readonly total = computed(() =>
    this.batches().reduce((n, b) => n + b.batch.photos.length, 0),
  );
  protected readonly allPhotos = computed(() => this.batches().flatMap((b) => b.batch.photos));

  /** "Download all": one ZIP of the photos the viewer may download, with what it leaves out. */
  protected readonly downloadAll = computed(() => {
    const all = this.view()?.downloadAll;
    if (!all?.url || all.photoCount === 0) {
      return null;
    }
    const locale = this.copyLocale.locale();
    const photos = translate(all.photoCount === 1 ? 'memory.onePhoto' : 'memory.photoCount', locale, { count: all.photoCount });
    const who = this.coParent() ?? translate('common.coParent', locale);
    const omitted =
      all.omitted === 0
        ? ''
        : ' ' +
          translate(all.omitted === 1 ? 'memory.download.omittedOne' : 'memory.download.omittedMany', locale, {
            count: all.omitted,
            name: who,
          });
    return {
      url: all.url,
      label: translate('memory.download.all', locale, { photos, size: sizeText(all.bytes) }),
      note: translate('memory.download.note', locale) + omitted,
    };
  });

  /** The final-week warning, from the first photo here to go. */
  protected readonly finalWeek = computed(() => {
    const photos = this.allPhotos();
    if (photos.length === 0) {
      return null;
    }
    const soonest = photos.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b), photos[0]);
    const locale = this.copyLocale.locale();
    const e = expiry(soonest.expiresAt, this.timeZone(), this.now(), locale);
    if (!e.soon) {
      return null;
    }
    const one = photos.length === 1;
    const when =
      e.days === 0
        ? translate(one ? 'memory.finalWeek.todayOne' : 'memory.finalWeek.todayMany', locale, { date: e.on })
        : e.days === 1
          ? translate(one ? 'memory.finalWeek.tomorrowOne' : 'memory.finalWeek.tomorrowMany', locale, { date: e.on })
          : translate(one ? 'memory.finalWeek.inDaysOne' : 'memory.finalWeek.inDaysMany', locale, { days: e.days, date: e.on });
    const keep = translate(this.exportOffered() ? 'memory.finalWeek.keepExport' : 'memory.finalWeek.keep', locale);
    return `${when} ${keep}`;
  });

  protected readonly deletedOn = computed(() => {
    const on = this.view()?.photosDeletedOn;
    return on && this.total() === 0 ? shortDate(familyDate(on, this.timeZone()), this.copyLocale.locale()) : null;
  });

  /** Room for this upload: the event's spots left, at most 5 at a time. */
  protected readonly room = computed(() => {
    const uploads = this.view()?.uploads;
    return uploads ? Math.min(uploads.maxPerUpload, uploads.remaining) : 0;
  });
  protected readonly canAdd = computed(() => {
    const uploads = this.view()?.uploads;
    return !!uploads && uploads.available && !uploads.blocked && uploads.remaining > 0;
  });

  /** One line on what the parent can do here now. */
  protected readonly uploadsText = computed(() => {
    const view = this.view();
    if (!view) {
      return null;
    }
    const u = view.uploads;
    if (u.blocked) {
      return blockedText(u.blocked, this.caregiver(), this.copyLocale.locale());
    }
    if (!u.available) {
      return translate('memory.upload.unavailable', this.copyLocale.locale());
    }
    if (u.remaining === 0) {
      return translate('memory.upload.limitReached', this.copyLocale.locale(), { limit: u.cap });
    }
    if (u.used === 0 && this.total() === 0) {
      const locale = this.copyLocale.locale();
      return translate(this.coParent() ? 'memory.upload.emptyWithCoParent' : 'memory.upload.empty', locale, {
        limit: u.cap,
        batch: u.maxPerUpload,
      });
    }
    return translate('memory.upload.quota', this.copyLocale.locale(), { remaining: u.remaining, used: u.used, limit: u.cap, days: RETENTION_DAYS });
  });

  protected readonly ready = computed(() => this.picks().filter((p) => p.state === 'ready'));
  /** Too many good files for the room left: the parent chooses again. */
  protected readonly tooMany = computed(() => {
    const room = this.room();
    const count = this.ready().length;
    if (count <= room) {
      return null;
    }
    const uploads = this.view()?.uploads;
    return uploads && room < uploads.maxPerUpload
      ? translate(room === 1 ? 'memory.upload.roomOne' : 'memory.upload.roomMany', this.copyLocale.locale(), { room })
      : translate('memory.upload.batchLimit', this.copyLocale.locale(), { limit: room, max: room });
  });
  protected readonly storageLeft = computed(() => {
    const u = this.view()?.uploads;
    return u
      ? translate('memory.upload.spaceLeft', this.copyLocale.locale(), { remaining: sizeText(Math.max(0, u.storageLimitBytes - u.storageUsedBytes)), limit: sizeText(u.storageLimitBytes) })
      : '';
  });
  protected readonly deletedOnIfAdded = computed(() =>
    deletedOnIfAddedToday(this.timeZone(), this.now(), this.copyLocale.locale()),
  );
  protected readonly added = computed(() => this.picks().filter((p) => p.state === 'added').length);
  protected readonly progress = computed(() => {
    const picks = this.picks().filter((p) => p.state !== 'skipped');
    const pending = picks.some((p) => p.state === 'waiting' || p.state === 'uploading');
    const failed = picks.filter((p) => p.state === 'failed').length;
    if (pending) {
      return translate('memory.upload.progress', this.copyLocale.locale(), { added: this.added(), total: picks.length });
    }
    return failed
      ? translate('memory.upload.partial', this.copyLocale.locale(), { added: this.added(), total: picks.length, failed })
      : translate(this.added() === 1 ? 'memory.upload.addedOne' : 'memory.upload.addedMany', this.copyLocale.locale(), { count: this.added() });
  });

  protected readonly heading = computed(() => `photos-heading-${this.eventId()}`);

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      const eventId = this.eventId();
      const blocked = this.notConfirmed();
      const googlePhotos = this.googlePhotos();
      untracked(() => {
        this.reset();
        if (!blocked) {
          void this.load(familyId, eventId);
          if (googlePhotos) {
            void this.exports.start(familyId, eventId);
          }
        }
      });
    });
  }

  private reset(): void {
    this.view.set(null);
    this.state.set('idle');
    this.sheet.set('closed');
    this.picks.set([]);
    this.openPhoto.set(null);
    this.confirmingDelete.set(false);
    this.confirmingUnshare.set(null);
    this.actionError.set(null);
    this.exportSheet.set(null);
  }

  protected async load(familyId = this.familyId(), eventId = this.eventId()): Promise<void> {
    this.state.set(this.view() ? 'ready' : 'loading');
    this.loadError.set(null);
    try {
      const view = await this.api.eventPhotos(familyId, eventId);
      if (this.eventId() === eventId) {
        this.view.set(view);
        this.state.set('ready');
        this.loaded.emit(view);
      }
    } catch (error) {
      if (this.eventId() === eventId) {
        this.loadError.set(translate('memory.photos.loadError', this.copyLocale.locale(), { reason: generalMessage(toProblem(error)) }));
        this.state.set('error');
      }
    }
  }

  protected batchLabel(shown: ShownBatch): string {
    return shown.batch.yours
      ? translate('memory.photos.ownBatch', this.copyLocale.locale(), { date: shown.date })
      : translate('memory.photos.parentBatch', this.copyLocale.locale(), { name: this.coParent() ?? translate('common.coParent', this.copyLocale.locale()), date: shown.date });
  }

  protected sharingChip(batch: PhotoBatch): string {
    if (!batch.yours) {
      return translate('memory.photos.sharedWithYou', this.copyLocale.locale());
    }
    return batch.visibleToCoParent && this.coParent()
      ? translate('memory.photos.sharedWith', this.copyLocale.locale(), { name: this.coParent() ?? translate('common.coParent', this.copyLocale.locale()) })
      : translate('memory.photos.onlyYou', this.copyLocale.locale());
  }

  protected photoLabel(photo: EventPhoto, shown: ShownBatch, index: number): string {
    const locale = this.copyLocale.locale();
    const whose = shown.batch.yours
      ? translate('memory.photos.yours', locale)
      : translate('memory.photos.sharedBy', locale, { name: this.coParent() ?? translate('common.coParentLower', locale) });
    return translate('memory.photos.position', locale, { position: shown.first + index, total: this.total(), owner: whose });
  }

  // --- Adding photos -------------------------------------------------------------------------------------------------

  protected choose(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected chosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) {
      return;
    }
    const max = this.view()?.uploads.maxFileBytes;
    this.picks.set(
      files.map((file) => {
        const message = fileProblem(file, max, this.copyLocale.locale());
        return {
          key: this.nextKey++,
          file,
          message,
          state: message ? 'skipped' : 'ready',
          retry: false,
        } as Pick;
      }),
    );
    this.offline.set(false);
    this.sheet.set('review');
    this.focus('#photos-sheet-heading');
  }

  protected cancelSheet(): void {
    this.sheet.set('closed');
    this.picks.set([]);
    this.focus('#photos-add');
  }

  /** Sends the checked files one at a time, into one batch, and reports each one's own result. */
  protected async upload(): Promise<void> {
    if (this.sheet() === 'uploading' || this.tooMany() || this.ready().length === 0) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.offline.set(true);
      return;
    }
    this.batchId = null;
    this.update((p) => (p.state === 'ready' ? { ...p, state: 'waiting' } : p));
    this.sheet.set('uploading');
    this.focus('#photos-sheet-heading');
    for (const pick of this.picks().filter((p) => p.state === 'waiting')) {
      await this.send(pick.key);
    }
    this.finish();
  }

  protected async retry(key: number): Promise<void> {
    if (this.sheet() === 'uploading' || !this.picks().some((p) => p.key === key && p.state === 'failed' && p.retry)) {
      return;
    }
    this.sheet.set('uploading');
    await this.send(key);
    this.finish();
  }

  private async send(key: number, again = true): Promise<void> {
    const pick = this.picks().find((p) => p.key === key);
    if (!pick) {
      return;
    }
    this.update((p) =>
      p.key === key ? { ...p, state: 'uploading', message: null, retry: false } : p,
    );
    this.uploadPercent.set(null);
    try {
      const result = await this.api.addEventPhoto(
        this.familyId(),
        this.eventId(),
        pick.file,
        this.batchId ?? undefined,
        (percent) => this.uploadPercent.set(percent),
      );
      this.batchId = result.batchId;
      this.update((p) => (p.key === key ? { ...p, state: 'added' } : p));
    } catch (error) {
      const problem = toProblem(error);
      // This upload's batch closed (30 minutes) or filled: the next photo starts a new one.
      if (again && (problem.reason === 'batch-closed' || problem.reason === 'batch-full')) {
        this.batchId = null;
        return this.send(key, false);
      }
      this.update((p) =>
        p.key === key
          ? { ...p, state: 'failed', message: uploadMessage(problem, this.copyLocale.locale()), retry: canRetry(problem) }
          : p,
      );
    }
  }

  private finish(): void {
    if (this.picks().some((p) => p.state === 'waiting' || p.state === 'uploading')) {
      return;
    }
    this.sheet.set('done');
    void this.load();
  }

  protected closeSheet(): void {
    const added = this.added();
    this.sheet.set('closed');
    this.picks.set([]);
    if (added > 0) {
      this.toasts.show(
        translate(added === 1 ? 'memory.added.one' : 'memory.added.many', this.copyLocale.locale(), { count: added }),
      );
    }
    this.focus('#photos-add');
  }

  private update(change: (p: Pick) => Pick): void {
    this.picks.update((picks) => picks.map(change));
  }

  protected size(bytes: number): string {
    return sizeText(bytes);
  }

  // --- Sharing -------------------------------------------------------------------------------------------------------

  protected async toggleSharing(
    batch: PhotoBatch,
    visible: boolean,
    toggle?: { checked: boolean },
  ): Promise<void> {
    if (!visible) {
      // Turning sharing off asks first; the switch stays on until they confirm.
      if (toggle) {
        toggle.checked = true;
      }
      this.confirmingUnshare.set(batch.id);
      this.focus(`#unshare-keep-${batch.id}`);
      return;
    }
    await this.share(batch, true);
  }

  protected async share(batch: PhotoBatch, visible: boolean): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.api.shareBatch(this.familyId(), batch.id, visible);
      this.confirmingUnshare.set(null);
      await this.load();
      this.toasts.show(
        visible
          ? translate('memory.photos.sharingEnabled', this.copyLocale.locale(), { name: this.coParent() ?? translate('common.coParent', this.copyLocale.locale()) })
          : translate('memory.photos.sharingDisabled', this.copyLocale.locale(), { name: this.coParent() ?? translate('common.coParent', this.copyLocale.locale()) }),
      );
    } catch (error) {
      this.actionError.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected keepSharing(batchId: string): void {
    this.confirmingUnshare.set(null);
    this.focus(`#share-${batchId} input, #share-${batchId} button`);
  }

  // --- Viewing and deleting one photo --------------------------------------------------------------------------------

  protected open(photo: EventPhoto): void {
    this.openPhoto.set(photo);
    this.confirmingDelete.set(false);
    this.actionError.set(null);
    this.focus('#photo-viewer-heading');
  }

  protected escape(event: Event): void {
    if (this.openPhoto()) {
      event.stopPropagation();
      this.closeViewer();
    }
  }

  protected closeViewer(): void {
    const photo = this.openPhoto();
    this.openPhoto.set(null);
    this.confirmingDelete.set(false);
    if (photo) {
      this.focus(`#photo-${photo.id}`);
    }
  }

  protected isYours(photo: EventPhoto): boolean {
    return this.batches().some(
      (b) => b.batch.yours && b.batch.photos.some((p) => p.id === photo.id),
    );
  }

  protected openLabel = computed(() => {
    const photo = this.openPhoto();
    if (!photo) {
      return '';
    }
    for (const shown of this.batches()) {
      const index = shown.batch.photos.findIndex((p) => p.id === photo.id);
      if (index >= 0) {
        return this.photoLabel(photo, shown, index);
      }
    }
    return translate('memory.photo', this.copyLocale.locale());
  });

  protected openExpiry = computed(() => {
    const photo = this.openPhoto();
    const locale = this.copyLocale.locale();
    return photo ? expiryChip(expiry(photo.expiresAt, this.timeZone(), this.now(), locale), locale) : '';
  });

  protected startDelete(): void {
    this.confirmingDelete.set(true);
    this.focus('#photo-keep');
  }

  protected keepPhoto(): void {
    this.confirmingDelete.set(false);
    this.focus('#photo-delete');
  }

  protected async deletePhoto(): Promise<void> {
    const photo = this.openPhoto();
    if (!photo) {
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.api.deleteEventPhoto(this.familyId(), photo.id);
      this.openPhoto.set(null);
      this.confirmingDelete.set(false);
      await this.load();
      this.toasts.show(translate('memory.photos.deleted', this.copyLocale.locale()));
      this.focus(this.canAdd() ? '#photos-add' : `#${this.heading()}`);
    } catch (error) {
      this.actionError.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  // --- Exporting to Google Photos (#404) ----------------------------------------------------------------------------

  /** The export sheet: closed (null), or open for the whole memory or one photo, before or after starting. */
  protected readonly exportSheet = signal<{ readonly photoId: string | null; readonly started: boolean } | null>(
    null,
  );

  /** Export is offered here: a parent's memory page with photos, once the server's status has loaded. */
  protected readonly exportOffered = computed(
    () => this.googlePhotos() && this.total() > 0 && !!this.exports.view(),
  );
  protected readonly exportAvailable = computed(() => this.exports.view()?.available ?? false);

  /** When the first photo here is deleted, for "they stay after these photos are deleted here on Nov 9". */
  protected readonly firstDeletedOn = computed(() => {
    const photos = this.allPhotos();
    if (photos.length === 0) {
      return null;
    }
    const soonest = photos.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b), photos[0]);
    return expiry(soonest.expiresAt, this.timeZone(), this.now(), this.copyLocale.locale()).on;
  });

  /** "2 photos here are in your Google Photos." */
  protected readonly exportedText = computed(() => {
    const n = this.exports.view()?.exported ?? 0;
    return n === 0
      ? null
      : translate(n === 1 ? 'memory.export.hereOne' : 'memory.export.hereMany', this.copyLocale.locale(), { count: n });
  });

  /** The export records the open sheet is about. */
  protected readonly sheetPhotos = computed<readonly PhotoExport[]>(() => {
    const sheet = this.exportSheet();
    const photos = this.exports.view()?.photos ?? [];
    return sheet?.photoId ? photos.filter((p) => p.photoId === sheet.photoId) : photos;
  });

  /** What the open sheet shows, from the server's status. */
  protected readonly sheetMode = computed(() => {
    const sheet = this.exportSheet();
    const v = this.exports.view();
    if (!sheet || !v) {
      return null;
    }
    if (!v.available) {
      return 'unavailable';
    }
    if (v.connection === 'NotConnected') {
      return 'connect';
    }
    if (v.connection === 'NeedsReconnect') {
      return 'reconnect';
    }
    if (sheet.started) {
      return 'progress';
    }
    if (sheet.photoId) {
      const record = this.exports.byPhoto().get(sheet.photoId);
      return !record || record.state === 'Failed' || record.state === 'Skipped' ? 'confirm' : 'progress';
    }
    return v.exportable > 0 ? 'confirm' : v.waiting > 0 ? 'progress' : 'nothing';
  });

  /** How many photos "Export" would send now. */
  protected readonly exportCount = computed(() =>
    this.exportSheet()?.photoId ? 1 : (this.exports.view()?.exportable ?? 0),
  );

  /** What isn't included, without naming anything private. */
  protected readonly exportSkipped = computed(() => {
    const v = this.exports.view();
    if (!v || this.exportSheet()?.photoId) {
      return null;
    }
    const locale = this.copyLocale.locale();
    const parts: string[] = [];
    if (v.exported > 0) {
      parts.push(translate(v.exported === 1 ? 'memory.export.skippedOne' : 'memory.export.skippedMany', locale, { count: v.exported }));
    }
    if (v.waiting > 0) {
      parts.push(translate(v.waiting === 1 ? 'memory.export.onWayOne' : 'memory.export.onWayMany', locale, { count: v.waiting }));
    }
    if (v.omitted > 0) {
      const who = this.coParent() ?? translate('common.coParent', locale);
      parts.push(
        translate(v.omitted === 1 ? 'memory.export.notAllowedOne' : 'memory.export.notAllowedMany', locale, {
          count: v.omitted,
          name: who,
        }),
      );
    }
    return parts.length ? parts.join(' ') : null;
  });

  /** Storage, and that copies outlive the photos here and can't be recalled. */
  protected readonly exportNote = computed(() => {
    const one = this.exportCount() === 1;
    const on = this.firstDeletedOn();
    const key = one
      ? on ? 'memory.export.noteOneOn' : 'memory.export.noteOne'
      : on ? 'memory.export.noteManyOn' : 'memory.export.noteMany';
    return translate(key, this.copyLocale.locale(), { date: on ?? '' });
  });

  protected readonly exportProgress = computed(() => progressText(this.sheetPhotos(), this.copyLocale.locale()));
  protected readonly sheetRetryable = computed(() =>
    this.sheetPhotos().filter((p) => this.line(p).retry),
  );

  protected line(photo: PhotoExport): ExportLine {
    return exportLine(photo, this.coParent(), this.firstDeletedOn(), this.copyLocale.locale());
  }

  /** A photo's mark on its tile and in the viewer, if it has an export record. */
  protected photoExport(photo: EventPhoto): ExportLine | null {
    if (!this.googlePhotos()) {
      return null;
    }
    const record = this.exports.byPhoto().get(photo.id);
    return record ? this.line(record) : null;
  }

  /** "Photo 3", by its place among the photos here; a deleted photo has none. */
  protected photoName(photoId: string): string {
    const index = this.allPhotos().findIndex((p) => p.id === photoId);
    return index < 0 ? translate('memory.photos.missing', this.copyLocale.locale()) : `Photo ${index + 1}`;
  }

  protected thumbnail(photoId: string): string | null {
    return this.allPhotos().find((p) => p.id === photoId)?.thumbnailUrl ?? null;
  }

  /** The viewer offers export for a photo the parent may download that isn't exported or on its way. */
  protected canExport(photo: EventPhoto): boolean {
    if (!this.exportOffered() || !this.exportAvailable() || !photo.downloadUrl) {
      return false;
    }
    const record = this.exports.byPhoto().get(photo.id);
    return !record || record.state === 'Failed' || record.state === 'Skipped';
  }

  protected openExport(photoId: string | null = null): void {
    if (photoId) {
      this.openPhoto.set(null);
      this.confirmingDelete.set(false);
    }
    this.exports.error.set(null);
    this.exportSheet.set({ photoId, started: false });
    void this.exports.refresh();
    this.focus('#export-sheet-heading');
  }

  protected async startExport(): Promise<void> {
    const sheet = this.exportSheet();
    if (!sheet || this.exports.busy()) {
      return;
    }
    const ok = await this.exports.export(sheet.photoId ? [sheet.photoId] : undefined);
    if (ok) {
      this.exportSheet.set({ ...sheet, started: true });
      this.focus('#export-sheet-heading');
    }
  }

  protected async retryExport(): Promise<void> {
    const ids = this.sheetRetryable().map((p) => p.photoId);
    if (ids.length > 0) {
      await this.exports.export(ids);
    }
  }

  protected closeExport(): void {
    const sheet = this.exportSheet();
    this.exportSheet.set(null);
    this.focus(sheet?.photoId ? `#photo-${sheet.photoId}` : '#export-open');
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
