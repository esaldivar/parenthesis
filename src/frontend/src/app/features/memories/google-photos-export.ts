import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Api, EventExport, PhotoExport, PhotoExportReason } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AppLocale, LocaleService } from '../../core/i18n/locale.service';
import { translate } from '../../core/i18n/translations';
import { OPEN_EXTERNAL } from '../settings/google-calendar-settings';

/** How often a memory with photos still on their way asks the server how far they got. Tests shorten it. */
export const EXPORT_POLL_MS = new InjectionToken<number>('EXPORT_POLL_MS', { factory: () => 4000 });

/** One photo's export, in the words the memory shows (#404). Only `done` means Google confirmed it. */
export interface ExportLine {
  readonly kind: 'done' | 'waiting' | 'checking' | 'failed' | 'skipped';
  readonly text: string;
  /** For failures that trying again can fix. */
  readonly retry: boolean;
}

/**
 * Google Photos export for one memory (#404): what exporting would include, the viewer's per-photo results, and the
 * actions. Every rule is the server's; this only shows what it reports and never marks a photo as exported until the
 * server says Google confirmed it. Polls while photos are waiting, and stops when the page goes away.
 */
@Injectable()
export class MemoryExport {
  private readonly api = inject(Api);
  private readonly openExternal = inject(OPEN_EXTERNAL);
  private readonly pollMs = inject(EXPORT_POLL_MS);
  private readonly locale = inject(LocaleService);

  private familyId = '';
  private eventId = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly view = signal<EventExport | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly byPhoto = computed(
    () => new Map((this.view()?.photos ?? []).map((p) => [p.photoId, p])),
  );
  readonly retryable = computed(() =>
    (this.view()?.photos ?? []).filter((p) => p.state === 'Failed' && canRetry(p.reason)),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Starts (or restarts, for another memory) and loads this memory's export status. */
  async start(familyId: string, eventId: string): Promise<void> {
    this.stop();
    this.familyId = familyId;
    this.eventId = eventId;
    this.view.set(null);
    this.error.set(null);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const eventId = this.eventId;
    try {
      const view = await this.api.eventExport(this.familyId, eventId);
      if (eventId === this.eventId) {
        this.show(view);
      }
    } catch (error) {
      if (eventId === this.eventId) {
        // A failed status check isn't shown as an export problem; the next action or visit tries again.
        this.schedule(toProblem(error).status === 0);
      }
    }
  }

  /** Queues the named photos, or every one the viewer may download. Returns false when nothing was queued. */
  async export(photoIds?: readonly string[]): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.show(await this.api.exportToGooglePhotos(this.familyId, this.eventId, photoIds));
      return true;
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 409) {
        // Not connected, reconnect needed or switched off: the refreshed status shows which.
        await this.refresh();
      } else {
        this.error.set(translate('memory.export.nothing', this.locale.locale(), { reason: generalMessage(problem) }));
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Leaves for Google's consent page; the server brings the parent back to this memory. */
  async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { url } = await this.api.googlePhotosAuthorize(this.familyId, this.eventId);
      this.openExternal(url);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
      this.busy.set(false);
    }
  }

  private show(view: EventExport): void {
    this.view.set(view);
    this.schedule(view.waiting > 0);
  }

  private schedule(again: boolean): void {
    this.stop();
    if (again) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.refresh();
      }, this.pollMs);
    }
  }

  private stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** Failures that trying again can fix. A deleted or expired photo, or one no longer allowed, can't. */
export function canRetry(reason: PhotoExportReason): boolean {
  return (
    reason === 'GoogleError' ||
    reason === 'StorageFull' ||
    reason === 'Reconnect' ||
    reason === 'RateLimited'
  );
}

/** The plain reason, as the design words it. `coParent` names whose photo it was, if known. */
export function reasonText(
  reason: PhotoExportReason,
  coParent: string | null,
  deletedOn: string | null,
  locale: AppLocale = 'en',
): string {
  switch (reason) {
    case 'Reconnect':
      return translate('memory.export.reason.reconnect', locale);
    case 'RateLimited':
      return deletedOn
        ? translate('memory.export.reason.rateLimitedUntil', locale, { date: deletedOn })
        : translate('memory.export.reason.rateLimited', locale);
    case 'StorageFull':
      return translate('memory.export.reason.storageFull', locale);
    case 'NotAllowed':
      return translate('memory.export.reason.notAllowed', locale, {
        name: coParent ?? translate('common.coParent', locale),
      });
    case 'Deleted':
      return translate('memory.export.reason.deleted', locale);
    case 'Expired':
      return translate('memory.export.reason.expired', locale);
    default:
      return translate('memory.export.reason.google', locale);
  }
}

/** What one photo's export shows. */
export function exportLine(
  photo: PhotoExport,
  coParent: string | null,
  deletedOn: string | null,
  locale: AppLocale = 'en',
): ExportLine {
  const reason = () => reasonText(photo.reason, coParent, deletedOn, locale);
  switch (photo.state) {
    case 'Exported':
      return { kind: 'done', text: translate('memory.export.line.done', locale), retry: false };
    case 'Checking':
      return { kind: 'checking', text: translate('memory.export.line.checking', locale), retry: false };
    case 'Queued':
      return photo.reason === 'None'
        ? { kind: 'waiting', text: translate('memory.export.line.exporting', locale), retry: false }
        : {
            kind: 'waiting',
            text: translate('memory.export.line.waiting', locale, { reason: reason() }),
            retry: false,
          };
    case 'Failed':
      return {
        kind: 'failed',
        text: translate('memory.export.line.failed', locale, { reason: reason() }),
        retry: canRetry(photo.reason),
      };
    default:
      return {
        kind: 'skipped',
        text: translate('memory.export.line.skipped', locale, { reason: reason() }),
        retry: false,
      };
  }
}

/** "3 of 5 in your Google Photos · 1 exporting · 1 couldn't export", for the progress line and the live region. */
export function progressText(photos: readonly PhotoExport[], locale: AppLocale = 'en'): string {
  const done = photos.filter((p) => p.state === 'Exported').length;
  const waiting = photos.filter((p) => p.state === 'Queued' || p.state === 'Checking').length;
  const failed = photos.filter((p) => p.state === 'Failed' || p.state === 'Skipped').length;
  const parts = [translate('memory.export.progress.done', locale, { done, total: photos.length })];
  if (waiting) {
    parts.push(translate('memory.export.progress.waiting', locale, { count: waiting }));
  }
  if (failed) {
    parts.push(translate('memory.export.progress.failed', locale, { count: failed }));
  }
  return parts.join(' · ');
}
