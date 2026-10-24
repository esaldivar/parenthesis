import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Icon } from '../icon/icon';
import { Toast, Toasts } from './toasts';

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

type Hold = 'hover' | 'focus' | 'hidden';

/**
 * Shows the parent app's toasts (#226): on phones along the bottom above the navigation, on desktop at the bottom
 * right. Each counts down from its own duration, pausing while hovered, focused or the tab is hidden, and has a Close
 * button. The list is one polite live region that's always there, so each new toast is announced once and focus never
 * moves.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <section class="toasts" aria-label="Notifications">
      <div role="status" aria-live="polite" aria-relevant="additions text">
        <ol>
          @for (toast of toasts.shown(); track toast.id) {
            <li class="toast" [attr.data-toast]="toast.id">
              <app-icon class="toast__icon" name="check" [size]="20" />
              <p class="toast__message">{{ toast.message }}</p>
              <button
                type="button"
                class="toast__close"
                (click)="close(toast)"
                aria-label="Close notification"
              >
                <app-icon name="close" [size]="20" />
              </button>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styleUrl: './toast-host.scss',
  // Pointing at or focusing any toast pauses them all, so none leaves while someone is reading or reaching for it.
  host: {
    '(mouseenter)': 'hold("hover")',
    '(mouseleave)': 'release("hover")',
    '(focusin)': 'hold("focus")',
    '(focusout)': 'release("focus")',
    '(keydown.escape)': 'closeFrom($event)',
  },
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  private readonly document = inject(DOCUMENT);
  private readonly timers = new Map<number, Timer>();
  /** Paused for these reasons; the countdowns run only when there are none. */
  private readonly holds = new Set<Hold>();

  constructor() {
    // Start a countdown for each new toast, and forget the ones that left.
    effect(() => {
      const shown = this.toasts.shown();
      untracked(() => {
        for (const toast of shown) {
          if (!this.timers.has(toast.id)) {
            const timer: Timer = { handle: null, remaining: toast.duration, startedAt: 0 };
            this.timers.set(toast.id, timer);
            if (this.holds.size === 0) {
              this.run(toast.id, timer);
            }
          }
        }
        for (const [id, timer] of this.timers) {
          if (!shown.some((t) => t.id === id)) {
            this.stop(timer);
            this.timers.delete(id);
          }
        }
      });
    });

    // A hidden tab pauses every countdown, so nothing disappears unread.
    const onVisibility = () =>
      this.document.hidden ? this.hold('hidden') : this.release('hidden');
    if (this.document.hidden) {
      this.holds.add('hidden');
    }
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.timers.forEach((timer) => this.stop(timer));
    });
  }

  protected hold(reason: Hold): void {
    this.holds.add(reason);
    this.timers.forEach((timer) => this.pause(timer));
  }

  protected release(reason: Hold): void {
    this.holds.delete(reason);
    if (this.holds.size === 0) {
      this.timers.forEach((timer, id) => this.run(id, timer));
    }
  }

  protected close(toast: Toast): void {
    this.toasts.dismiss(toast.id);
    // Focus was on its Close button, which is gone: the countdowns carry on.
    this.release('focus');
  }

  /** Escape on a focused toast closes it. */
  protected closeFrom(event: Event): void {
    const id = Number(
      (event.target as Element | null)?.closest('[data-toast]')?.getAttribute('data-toast'),
    );
    const toast = this.toasts.shown().find((t) => t.id === id);
    if (toast) {
      this.close(toast);
    }
  }

  private run(id: number, timer: Timer): void {
    if (timer.handle !== null) {
      return;
    }
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.toasts.dismiss(id), timer.remaining);
  }

  private pause(timer: Timer): void {
    if (timer.handle === null) {
      return;
    }
    this.stop(timer);
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }

  private stop(timer: Timer): void {
    if (timer.handle !== null) {
      clearTimeout(timer.handle);
      timer.handle = null;
    }
  }
}
