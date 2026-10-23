import { Injectable, signal } from '@angular/core';

/** A short confirmation that something worked (#226). Errors are never toasts: they stay next to what needs fixing. */
export interface Toast {
  readonly id: number;
  readonly message: string;
  /** How long it shows, in milliseconds, not counting time paused. */
  readonly duration: number;
}

/** At most this many show at once; a new one makes the oldest leave. */
export const MAX_TOASTS = 3;

/** The shortest and longest a toast shows (owner-approved suggestion, #226). */
export const MIN_DURATION = 6000;
export const MAX_DURATION = 10000;

/**
 * How long a message shows: 6 seconds for up to 12 words, then a quarter-second for each word more, up to 10 seconds,
 * so a longer message can still be read in time. Hovering, focusing it, or leaving the tab pauses the countdown.
 */
export function toastDuration(message: string): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, MIN_DURATION + (words - 12) * 250));
}

/** The parent app's toasts: what's showing now. The host in the parent shell shows them and times them out. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private next = 1;
  readonly shown = signal<readonly Toast[]>([]);

  /** Shows a confirmation. Repeating the message that's already newest just restarts it, rather than stacking. */
  show(message: string): void {
    const text = message.trim();
    if (!text) {
      return;
    }
    const toast: Toast = { id: this.next++, message: text, duration: toastDuration(text) };
    this.shown.update((shown) =>
      [...shown.filter((t) => t.message !== text), toast].slice(-MAX_TOASTS),
    );
  }

  dismiss(id: number): void {
    this.shown.update((shown) => shown.filter((t) => t.id !== id));
  }

  clear(): void {
    this.shown.set([]);
  }
}
