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
import { Api, EventPhoto, EventPhotos, PhotoBatch } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { Toasts } from '../../shared/toast/toasts';
import { monthDay } from '../dashboard/week';
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
  sizeText,
  uploadMessage,
} from './photo-text';

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
  imports: [MatButtonModule, MatSlideToggleModule, RouterLink, Icon],
  // Escape closes an open photo first, before the event details around it.
  host: { '(keydown.escape)': 'escape($event)' },
  templateUrl: './event-photos.html',
  styleUrl: './event-photos.scss',
})
export class EventPhotosSection {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly now = inject(PHOTOS_NOW);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

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
    let first = 1;
    return view.batches
      .filter((b) => b.photos.length > 0)
      .map((batch) => {
        const soonest = batch.photos.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
        const shown = {
          batch,
          date: monthDay(familyDate(batch.createdAt, this.timeZone())),
          first,
          expiry: expiryChip(expiry(soonest.expiresAt, zone, now)),
        };
        first += batch.photos.length;
        return shown;
      });
  });
  protected readonly total = computed(() =>
    this.batches().reduce((n, b) => n + b.batch.photos.length, 0),
  );
  protected readonly allPhotos = computed(() => this.batches().flatMap((b) => b.batch.photos));

  /** The final-week warning, from the first photo here to go. */
  protected readonly finalWeek = computed(() => {
    const photos = this.allPhotos();
    if (photos.length === 0) {
      return null;
    }
    const soonest = photos.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
    const e = expiry(soonest.expiresAt, this.timeZone(), this.now());
    if (!e.soon) {
      return null;
    }
    const when =
      e.days === 0
        ? `today, ${e.on}`
        : e.days === 1
          ? `tomorrow, ${e.on}`
          : `in ${e.days} days, on ${e.on}`;
    return `${photos.length === 1 ? 'This photo is' : 'These photos are'} deleted ${when}. Download any you want to keep.`;
  });

  protected readonly deletedOn = computed(() => {
    const on = this.view()?.photosDeletedOn;
    return on && this.total() === 0 ? monthDay(familyDate(on, this.timeZone())) : null;
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
      return blockedText(u.blocked, this.caregiver());
    }
    if (!u.available) {
      return 'Adding photos isn’t available yet.';
    }
    if (u.remaining === 0) {
      return `You’ve added all ${u.cap} of your photos for this event. Delete one to add another.`;
    }
    if (u.used === 0 && this.total() === 0) {
      return `No photos yet. Add up to ${u.cap} of your own, ${u.maxPerUpload} at a time. ${
        this.coParent() ? 'Only you see them unless you share them.' : 'Only you see them.'
      }`;
    }
    return `You can add ${u.remaining} more (${u.used} of your ${u.cap} used). Photos are deleted ${RETENTION_DAYS} days after upload.`;
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
      ? `This event has room for ${room} more of your photos. Choose ${room === 1 ? '1 photo' : `${room} or fewer`}.`
      : `Add up to ${room} photos at a time. Choose ${room} or fewer.`;
  });
  protected readonly storageLeft = computed(() => {
    const u = this.view()?.uploads;
    return u
      ? `${sizeText(Math.max(0, u.storageLimitBytes - u.storageUsedBytes))} of your ${sizeText(u.storageLimitBytes)} left`
      : '';
  });
  protected readonly deletedOnIfAdded = computed(() =>
    deletedOnIfAddedToday(this.timeZone(), this.now()),
  );
  protected readonly added = computed(() => this.picks().filter((p) => p.state === 'added').length);
  protected readonly progress = computed(() => {
    const picks = this.picks().filter((p) => p.state !== 'skipped');
    const pending = picks.some((p) => p.state === 'waiting' || p.state === 'uploading');
    const failed = picks.filter((p) => p.state === 'failed').length;
    if (pending) {
      return `Adding photos… ${this.added()} of ${picks.length} added.`;
    }
    return failed
      ? `${this.added()} of ${picks.length} photos added. ${failed} couldn’t be added.`
      : `${this.added() === 1 ? 'Your photo was' : `All ${this.added()} photos were`} added.`;
  });

  protected readonly heading = computed(() => `photos-heading-${this.eventId()}`);

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      const eventId = this.eventId();
      const blocked = this.notConfirmed();
      untracked(() => {
        this.reset();
        if (!blocked) {
          void this.load(familyId, eventId);
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
        this.loadError.set(`Photos couldn’t load. ${generalMessage(toProblem(error))}`);
        this.state.set('error');
      }
    }
  }

  protected batchLabel(shown: ShownBatch): string {
    return shown.batch.yours
      ? `Your photos · ${shown.date}`
      : `${this.coParent() ?? 'Your co-parent'}’s photos · ${shown.date}`;
  }

  protected sharingChip(batch: PhotoBatch): string {
    if (!batch.yours) {
      return 'Shared with you';
    }
    return batch.visibleToCoParent && this.coParent()
      ? `Shared with ${this.coParent()}`
      : 'Only you';
  }

  protected photoLabel(photo: EventPhoto, shown: ShownBatch, index: number): string {
    const whose = shown.batch.yours ? 'yours' : `shared by ${this.coParent() ?? 'your co-parent'}`;
    return `Photo ${shown.first + index} of ${this.total()}, ${whose}`;
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
        const message = fileProblem(file, max);
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
    if (this.tooMany() || this.ready().length === 0) {
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
    try {
      const result = await this.api.addEventPhoto(
        this.familyId(),
        this.eventId(),
        pick.file,
        this.batchId ?? undefined,
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
          ? { ...p, state: 'failed', message: uploadMessage(problem), retry: canRetry(problem) }
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
        `${added === 1 ? 'Photo' : `${added} photos`} added. Only you can see ${added === 1 ? 'it' : 'them'} until you share.`,
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
          ? `${this.coParent() ?? 'Your co-parent'} can now see these photos.`
          : `${this.coParent() ?? 'Your co-parent'} can’t see these photos any more.`,
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
    return 'Photo';
  });

  protected openExpiry = computed(() => {
    const photo = this.openPhoto();
    return photo ? expiryChip(expiry(photo.expiresAt, this.timeZone(), this.now())) : '';
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
      this.toasts.show('Photo deleted. Its spot and storage are free again.');
      this.focus(this.canAdd() ? '#photos-add' : `#${this.heading()}`);
    } catch (error) {
      this.actionError.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
