import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../core/chat/chat.store';
import { Icon } from '../../shared/icon/icon';
import { ChatConversation } from './chat-conversation';

/** The server's limit (ADR-0008). */
export { MESSAGE_MAX_LENGTH } from './chat-conversation';

/**
 * Messages (#125, docs/design/m4-chat.md): the parents' conversation as a full page. On phones it fills the screen, as in
 * the mockups, with Back to Home. On desktop, Minimize docks the same conversation, draft and chosen event as the
 * compact chat over the page the parent came from.
 */
@Component({
  selector: 'app-messages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ChatConversation],
  template: `
    <app-chat-conversation [level]="1">
      <a chatLead class="round" routerLink="/" aria-label="Back to Home"><app-icon name="chevron-left" [size]="26" /></a>
      <button chatActions class="round minimize" type="button" aria-label="Minimize to compact chat" (click)="minimize()">
        <app-icon name="minus" [size]="24" />
      </button>
    </app-chat-conversation>
  `,
  styles: `
    :host {
      display: block;
      height: calc(100dvh - 6.5rem);
      min-height: 20rem;
      max-width: 56rem;
      margin-inline: auto;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
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
    .round:hover {
      background: var(--color-surface-soft);
    }
    .round:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    /* The compact chat is for desktop; phones and tablets keep the full screen. */
    @media (max-width: 1023.98px) {
      :host {
        height: 100dvh;
        max-width: none;
        border: 0;
        border-radius: 0;
        padding-bottom: env(safe-area-inset-bottom);
      }
      .minimize {
        display: none;
      }
    }
  `,
})
export class MessagesPage {
  private readonly chat = inject(ChatStore);
  private readonly router = inject(Router);

  /** Docks the conversation as the compact chat and goes back to the page the parent came from. */
  protected async minimize(): Promise<void> {
    this.chat.dock.set('open');
    await this.router.navigateByUrl(this.chat.returnUrl() ?? '/');
  }
}
