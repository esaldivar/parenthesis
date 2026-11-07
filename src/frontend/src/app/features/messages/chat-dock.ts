import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '../../core/chat/chat.store';
import { Icon } from '../../shared/icon/icon';
import { ChatConversation } from './chat-conversation';

/**
 * The compact desktop chat (slice 2 of docs/design/m4-chat.md): the same conversation, draft and chosen event as the
 * Messages page, docked bottom right over the current page. It isn't modal: the page around it stays usable. Minimize
 * folds it to a bar (and stops marking messages read), Expand opens the full Messages page, Close puts it away.
 * Desktop only (1024px and wider); phones and tablets use the full-screen page.
 */
@Component({
  selector: 'app-chat-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ChatConversation],
  template: `
    @switch (chat.dock()) {
      @case ('open') {
        <section class="dock" aria-label="Compact chat">
          <app-chat-conversation [level]="2" [active]="true" [focusOnReady]="true">
            <button chatActions class="round" type="button" aria-label="Expand to full chat" (click)="expand()">
              <app-icon name="expand" [size]="22" />
            </button>
            <button chatActions class="round" type="button" aria-label="Minimize chat" (click)="minimize()">
              <app-icon name="minus" [size]="22" />
            </button>
            <button chatActions class="round" type="button" aria-label="Close chat" (click)="close()">
              <app-icon name="close" [size]="22" />
            </button>
          </app-chat-conversation>
        </section>
      }
      @case ('minimized') {
        <section class="bar" aria-label="Compact chat, minimized">
          <button class="restore" type="button" (click)="restore()">
            <app-icon name="messages" [size]="22" />
            <span>Messages</span>
            @if (chat.hasUnread()) {
              <span class="dot" aria-hidden="true"></span>
              <span class="visually-hidden">, unread messages</span>
            }
            <span class="visually-hidden">. Open the compact chat</span>
          </button>
          <button class="round" type="button" aria-label="Close chat" (click)="close()">
            <app-icon name="close" [size]="22" />
          </button>
        </section>
      }
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset-inline-end: var(--space-6);
      bottom: var(--space-4);
      /* Over page content and the calendar's bars; below dimmed sheets (20) and toasts (30). */
      z-index: 15;
    }
    .dock {
      width: min(24rem, calc(100vw - 2 * var(--space-6)));
      height: min(36rem, calc(100dvh - 7rem));
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
    }
    .restore {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--target-min);
      padding: 0 var(--space-4);
      border: 0;
      border-radius: var(--radius-pill);
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
    .dot {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background: var(--color-action);
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
    this.chat.dock.set('closed');
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

  /** Puts the chat away; focus returns to the page's main content. */
  protected close(): void {
    this.chat.dock.set('closed');
    afterNextRender(() => document.getElementById('main-content')?.focus(), { injector: this.injector });
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
