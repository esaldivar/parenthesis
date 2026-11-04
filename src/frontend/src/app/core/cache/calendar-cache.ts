import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { CalendarEvent, Reminder, SharedTask } from '../api/api';

/** One calendar period as the server last returned it. */
export interface CachedPeriod {
  readonly events: readonly CalendarEvent[];
  readonly reminders: readonly Reminder[];
  readonly tasks: readonly SharedTask[];
}

interface Entry extends CachedPeriod {
  readonly at: number;
}

/** Periods kept: enough to step back and forth between a few weeks and months. */
export const CALENDAR_CACHE_SIZE = 12;
/** Older than this, a period is fetched as if it had never been seen. */
export const CALENDAR_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Calendar periods already seen in this tab (#415), so going back to a week shows it at once while it is fetched
 * again. Memory only (owner decision, November 4, 2026): nothing is written to the device, and a reload starts empty.
 *
 * Every entry is keyed by the viewer and the family, and the whole cache is cleared when the signed-in profile changes
 * and after any change the app sends to the server (see {@link clearCalendarCacheOnWrite}). What is shown from it is
 * always replaced by the server's answer, which stays the source of truth.
 */
@Injectable({ providedIn: 'root' })
export class CalendarCache {
  private readonly entries = new Map<string, Entry>();
  private viewer: string | null = null;
  private generation = 0;

  /** The viewer whose periods are kept. A different viewer (or none) clears everything first. */
  useViewer(viewer: string | null): void {
    if (viewer !== this.viewer) {
      this.clear();
      this.viewer = viewer;
    }
  }

  get(familyId: string, from: string, to: string, now = Date.now()): CachedPeriod | null {
    const key = this.key(familyId, from, to);
    const entry = key === null ? undefined : this.entries.get(key);
    if (!entry || key === null) {
      return null;
    }
    if (now - entry.at > CALENDAR_CACHE_MAX_AGE_MS) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  /** Taken before a fetch starts, and passed back to {@link set}: an answer older than the last clear is not kept. */
  stamp(): number {
    return this.generation;
  }

  set(familyId: string, from: string, to: string, period: CachedPeriod, stamp: number, now = Date.now()): void {
    const key = this.key(familyId, from, to);
    if (key === null || stamp !== this.generation) {
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, { ...period, at: now });
    while (this.entries.size > CALENDAR_CACHE_SIZE) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  clear(): void {
    this.entries.clear();
    this.generation++;
  }

  get size(): number {
    return this.entries.size;
  }

  private key(familyId: string, from: string, to: string): string | null {
    return this.viewer === null ? null : `${this.viewer}|${familyId}|${from}|${to}`;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Any change sent to the server (an event, an approval, a child, a sign-out...) clears the calendar cache when it is
 * sent and again when it finishes, so a period read before the change is never shown again as if it were current.
 */
export const clearCalendarCacheOnWrite: HttpInterceptorFn = (request, next) => {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return next(request);
  }
  const cache = inject(CalendarCache);
  cache.clear();
  return next(request).pipe(finalize(() => cache.clear()));
};
