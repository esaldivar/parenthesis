import { TranslatePipe } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';
import { ChatTranscripts } from '../../components/chat-transcripts/chat-transcripts.component';

/**
 * The phone's Transcripts screen (#125, slice 3): the document icon in the conversation's header opens it, with the
 * same Save transcript and Saved transcripts as the desktop Messages page's left column. Back returns to the chat.
 */
@Component({
  selector: 'app-transcripts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, Icon, ChatTranscripts],
  template: `
    <app-chat-transcripts [level]="1">
      <a transcriptsLead class="round" routerLink="/messages" aria-label="{{ 'feature.back.to.messages' | tr }}">
        <app-icon name="chevron-left" [size]="26" />
      </a>
    </app-chat-transcripts>
  `,
  styles: `
    :host {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      display: block;
      max-width: 40rem;
      min-height: 100dvh;
      margin-inline: auto;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--color-canvas);
    }
    /* #724: the same faint theme leaves as the Messages conversation, top right and mirrored bottom left. */
    :host::before,
    :host::after {
      content: '';
      position: absolute;
      z-index: -1;
      inline-size: min(15rem, 60%);
      aspect-ratio: 880 / 799;
      background: url('/art/from-your-kids/photos/background-leaves.webp') center / contain no-repeat;
      opacity: var(--leaves-opacity, 0.11);
      pointer-events: none;
    }
    :host::before {
      inset-block-start: 3rem;
      inset-inline-end: -3rem;
    }
    :host::after {
      inset-block-end: 1rem;
      inset-inline-start: -3rem;
      transform: scaleX(-1);
    }
    :host-context(html[data-theme='dark']) {
      --leaves-opacity: 0.08;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme])) {
        --leaves-opacity: 0.08;
      }
    }
    .round {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--target-min);
      height: var(--target-min);
      border-radius: 50%;
      color: var(--color-text);
    }
    .round:hover {
      background: var(--color-surface-soft);
    }
    .round:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
  `,
})
export class TranscriptsPage {}
