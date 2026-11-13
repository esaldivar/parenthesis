import { TranslatePipe } from '../../../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '../../../../core/chat/chat.store';
import { Icon } from '../../../../shared/icon/icon';
import { ChatConversation } from '../chat-conversation/chat-conversation.component';

/**
 * The compact desktop chat (slice 2 of docs/design/m4-chat.md): the same conversation, draft and chosen event as the
 * Messages page, docked bottom right over the current page. It isn't modal: the page around it stays usable. Like a
 * messaging tray it's always there: minimized to a bar at the bottom right (which marks nothing read, and pulses a dot
 * when a message is unread), opened over the page, or expanded to the full Messages page.
 * Desktop only (1024px and wider); phones and tablets use the full-screen page.
 */
@Component({
  selector: 'app-chat-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Icon, ChatConversation],
  template: `
    @switch (chat.dock()) {
      @case ('open') {
        <section class="dock" aria-label="{{ 'feature.compact.chat' | tr }}">
          <app-chat-conversation [level]="2" [active]="true" [focusOnReady]="true">
            <button chatActions class="round" type="button" aria-label="{{ 'feature.expand.to.full.chat' | tr }}" (click)="expand()">
              <app-icon name="expand" [size]="22" />
            </button>
            <button chatActions class="round" type="button" aria-label="{{ 'feature.minimize.chat' | tr }}" (click)="minimize()">
              <app-icon name="minus" [size]="22" />
            </button>
          </app-chat-conversation>
        </section>
      }
      @case ('minimized') {
        <section class="bar" aria-label="{{ 'feature.compact.chat.minimized' | tr }}">
          <button class="restore" type="button" (click)="restore()">
            <app-icon name="messages" [size]="22" />
            <span>{{ 'feature.messages' | tr }}</span>
            @if (chat.hasUnread()) {
              <span class="dot" aria-hidden="true"></span>
              <span class="visually-hidden">{{ 'feature.unread.messages' | tr }}</span>
            }
            <span class="visually-hidden">{{ 'feature.open.the.compact.chat' | tr }}</span>
            <app-icon class="chevron" name="chevron-up" [size]="20" />
          </button>
        </section>
      }
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset-inline-end: var(--space-6);
      bottom: 0;
      /* Over page content and the calendar's bars; below dimmed sheets (20) and toasts (30). */
      z-index: 15;
    }
    .dock {
      width: min(var(--chat-dock-open-width), calc(100vw - 2 * var(--space-6)));
      height: var(--chat-dock-open-height);
      border: 1px solid var(--color-outline);
      border-bottom: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      overflow: hidden;
      box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
    }
    /* A tab along the bottom edge, like a messaging tray. */
    .bar {
      width: var(--chat-dock-bar-width);
      border: 1px solid var(--color-outline);
      border-bottom: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      background: var(--color-surface);
      box-shadow: 0 -2px 16px rgb(0 0 0 / 16%);
    }
    .restore {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: 3.25rem;
      padding: 0 var(--space-4);
      border: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      background: transparent;
      color: var(--color-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .restore:hover,
    .round:hover {
      background: var(--color-surface-soft);
    }
    .round {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--target-min);
      height: var(--target-min);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text);
      cursor: pointer;
    }
    .restore:focus-visible,
    .round:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    .chevron {
      margin-inline-start: auto;
    }
    .dot {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background: var(--color-notify);
    }
    /* A new message: the same green "new" dot as the rest of the app. It pulses twice and then stays still, so nothing
       keeps moving for more than five seconds (WCAG 2.2.2); a steady dot with reduced motion; words for screen readers
       either way. */
    @media (prefers-reduced-motion: no-preference) {
      .dot {
        animation: unread-pulse 1.6s ease-in-out 2;
      }
    }
    @keyframes unread-pulse {
      50% {
        box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-notify) 30%, transparent);
      }
    }
    @media (max-width: 1023.98px) {
      :host {
        display: none;
      }
    }
  `,
})
export class ChatDock {
  protected readonly chat = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected async expand(): Promise<void> {
    this.chat.dock.set('minimized');
    await this.router.navigateByUrl('/messages');
  }

  /** Folds to a bar; focus stays with the chat, on the button that opens it again. */
  protected minimize(): void {
    this.chat.dock.set('minimized');
    this.focusAfterRender('.restore');
  }

  /** Opens again, with focus in the message box (focusOnReady): the draft and chosen event are still there. */
  protected restore(): void {
    this.chat.dock.set('open');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
