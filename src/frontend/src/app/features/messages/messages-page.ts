import { TranslatePipe } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../core/chat/chat.store';
import { Icon } from '../../shared/icon/icon';
import { ChatConversation } from './chat-conversation';
import { ChatTranscripts } from './chat-transcripts';

/** The server's limit (ADR-0008). */
export { MESSAGE_MAX_LENGTH } from './chat-conversation';

/**
 * Messages (#125, docs/design/m4-chat.md): the parents' conversation as a full page. On phones it fills the screen, as in
 * the mockups, with Back to Home and Transcripts (the document icon). On desktop, Save transcript and Saved transcripts
 * sit in a left column, and Minimize docks the same conversation, draft and chosen event as the compact chat over the
 * page the parent came from.
 */
@Component({
  selector: 'app-messages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, Icon, ChatConversation, ChatTranscripts],
  template: `
    <aside class="transcripts" aria-label="{{ 'feature.transcripts' | tr }}">
      <app-chat-transcripts [level]="2" />
    </aside>
    <app-chat-conversation class="conversation" [level]="1">
      <a chatLead class="round" routerLink="/" aria-label="{{ 'feature.back.to.home' | tr }}"><app-icon name="chevron-left" [size]="26" /></a>
      <a chatActions class="round transcripts-link" routerLink="/messages/transcripts" aria-label="{{ 'feature.transcripts' | tr }}">
        <app-icon name="note" [size]="24" />
      </a>
      <button chatActions class="round minimize" type="button" aria-label="{{ 'feature.minimize.to.compact.chat' | tr }}" (click)="minimize()">
        <app-icon name="minus" [size]="24" />
      </button>
    </app-chat-conversation>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 18rem minmax(0, 1fr);
      height: calc(100dvh - 6.5rem);
      min-height: 20rem;
      max-width: 76rem;
      margin-inline: auto;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
    }
    .transcripts {
      overflow-y: auto;
      border-inline-end: 1px solid var(--color-divider);
      background: var(--color-canvas);
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
    /* Desktop has the left column, so the header link is for phones and tablets. */
    .transcripts-link {
      display: none;
    }
    /* The compact chat and the left column are for desktop; phones and tablets keep the full screen. */
    @media (max-width: 1023.98px) {
      :host {
        display: block;
        height: 100dvh;
        max-width: none;
        border: 0;
        border-radius: 0;
        padding-bottom: env(safe-area-inset-bottom);
      }
      .transcripts,
      .minimize {
        display: none;
      }
      .transcripts-link {
        display: inline-grid;
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
