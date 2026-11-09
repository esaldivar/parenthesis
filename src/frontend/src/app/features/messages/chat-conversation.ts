import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  input,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, ChatEventCard, ChatMessage } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { ChatStore } from '../../core/chat/chat.store';
import { Avatar } from '../../shared/avatar/avatar';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon } from '../../shared/icon/icon';
import { ChatEventCardView } from './event-card';
import { ChatEventPicker } from './event-picker';

/** The server's limit (ADR-0008). */
export const MESSAGE_MAX_LENGTH = 2000;
/** How close to the end of the conversation still counts as "at the latest message". */
const BOTTOM_SLACK_PX = 48;

/**
 * The parents' conversation (#125, docs/design/m4-chat.md), shared by the Messages page and the compact desktop chat:
 * both show the same messages, draft and chosen event, kept in the ChatStore. Text and calendar event cards; a sent
 * message can't be edited or deleted. A failed send stays as "Not sent" with Retry, which can't duplicate it. Messages
 * count as read only while `active` (not minimized) and the latest one is on screen in a visible tab. Dictation is the
 * phone keyboard's own: it fills the text box, and Send stays separate.
 *
 * The host projects its own controls: `[chatLead]` before the co-parent's name (Back) and `[chatActions]` after the
 * calendar search (Minimize, Expand).
 */
@Component({
  selector: 'app-chat-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, MatButtonModule, RouterLink, Avatar, EmptyState, Icon, ChatEventCardView, ChatEventPicker],
  template: `
    <header class="chat-header">
      <ng-content select="[chatLead]" />
      @if (coParent(); as other) {
        <app-avatar [name]="other.displayName" kind="parent" [personId]="other.membershipId" [size]="40" />
        @if (level() === 1) {
          <h1><span class="visually-hidden">{{ 'feature.messages.with' | tr }} </span>{{ other.displayName }}</h1>
        } @else {
          <h2><span class="visually-hidden">{{ 'feature.messages.with' | tr }} </span>{{ other.displayName }}</h2>
        }
      } @else if (level() === 1) {
        <h1>{{ 'feature.messages' | tr }}</h1>
      } @else {
        <h2>{{ 'feature.messages' | tr }}</h2>
      }
      <span class="spacer"></span>
      @if (state() === 'ready' && coParent()) {
        <button
          #pickerButton
          class="icon-button"
          type="button"
          aria-label="{{ 'feature.share.a.calendar.event' | tr }}"
          aria-haspopup="dialog"
          (click)="picking.set(true)"
        >
          <app-icon name="search" [size]="24" />
        </button>
      }
      <ng-content select="[chatActions]" />
    </header>

    @switch (state()) {
      @case ('loading') {
        <p class="note muted" role="status">Loading messages…</p>
      }
      @case ('error') {
        <div class="note">
          <p class="alert" role="alert">{{ error() }}</p>
          <button mat-stroked-button type="button" (click)="load()">Try again</button>
        </div>
      }
      @case ('ready') {
        @if (!coParent() && messages().length === 0) {
          <div class="note">
            <app-empty-state
              icon="messages"
              title="No one to message yet"
              body="Messages are just between you and your co-parent. Invite them from Settings to start talking here."
            >
              <a mat-stroked-button routerLink="/settings">Open Settings</a>
            </app-empty-state>
          </div>
        } @else {
          <div class="log" #log tabindex="0" role="region" [attr.aria-label]="'Conversation with ' + name()" (scroll)="onScroll()">
            @if (hasOlder()) {
              <button mat-button type="button" class="older" [disabled]="loadingOlder()" (click)="loadOlder()">
                {{ loadingOlder() ? 'Loading…' : 'Load earlier messages' }}
              </button>
            }
            @if (olderError(); as message) {
              <p class="alert" role="alert">{{ message }}</p>
            }
            @if (messages().length === 0 && pending().length === 0) {
              <p class="muted start">No messages yet. Say hello to {{ name() }}.</p>
            }
            <ol class="messages">
              @for (message of messages(); track message.id) {
                @if (message.id === dividerBefore()) {
                  <li class="divider"><span>New messages</span></li>
                }
                <li class="message" [class.message--yours]="message.yours">
                  @if (!message.yours && message.senderMembershipId !== coParent()?.membershipId) {
                    <span class="sender">Former parent</span>
                  }
                  <div class="bubble">
                    <span class="visually-hidden">{{ message.yours ? 'You' : senderName(message.senderMembershipId) }}, {{ message.sentAt | appDate: 'MMM d, h:mm a' }}: </span>
                    @if (message.text) {
                      <p class="text">{{ message.text }}</p>
                    }
                    @if (message.event; as card) {
                      <app-chat-event-card [card]="card" [timeZone]="timeZone()" />
                    } @else if (message.eventId) {
                      <p class="muted">Loading the event…</p>
                    }
                  </div>
                  @if (message.id === readReceipt()) {
                    <p class="status">Read</p>
                  }
                </li>
              }
              @for (message of pending(); track message.clientMessageId) {
                <li class="message message--yours" [class.message--failed]="message.state === 'failed'">
                  <div class="bubble">
                    <span class="visually-hidden">You: </span>
                    @if (message.text) {
                      <p class="text">{{ message.text }}</p>
                    }
                    @if (message.event; as card) {
                      <app-chat-event-card [card]="card" [timeZone]="timeZone()" [link]="false" />
                    }
                  </div>
                  @if (message.state === 'failed' && message.eventGone) {
                    <p class="status status--failed">
                      <span class="not-sent"><app-icon name="alert" [size]="20" />Not sent. That event isn’t on your calendar any more.</span>
                      @if (message.text) {
                        <button mat-stroked-button type="button" (click)="sendWithoutEvent(message.clientMessageId)">Send without it</button>
                      }
                      <button mat-button type="button" (click)="discard(message.clientMessageId)">Discard</button>
                    </p>
                  } @else if (message.state === 'failed') {
                    <p class="status status--failed">
                      <span class="not-sent"><app-icon name="alert" [size]="20" />Not sent</span>
                      <button
                        mat-stroked-button
                        type="button"
                        [attr.aria-label]="'Retry sending: ' + describe(message)"
                        (click)="retry(message.clientMessageId)"
                      >
                        Retry
                      </button>
                    </p>
                  } @else {
                    <p class="status">Sending…</p>
                  }
                </li>
              }
            </ol>
          </div>

          @if (newBelow()) {
            <button mat-stroked-button type="button" class="jump" (click)="scrollToLatest(true)">New messages below</button>
          }

          <p class="typing" aria-live="polite">
            @if (typing()) {
              <span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
              {{ name() }} is typing…
            }
          </p>
          <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>

          <form class="composer" (submit)="send($event)">
            @if (draftEvent(); as card) {
              <div class="draft-event">
                <span class="visually-hidden">Sharing this event with your message: </span>
                <app-chat-event-card [card]="card" [timeZone]="timeZone()" [link]="false" />
                <button
                  #removeEvent
                  class="icon-button"
                  type="button"
                  [attr.aria-label]="'Remove ' + card.title + ' from the message'"
                  (click)="removeDraftEvent()"
                >
                  <app-icon name="close" [size]="22" />
                </button>
              </div>
            }
            <label class="visually-hidden" [for]="id + '-draft'">Message {{ name() }}</label>
            <textarea
              [id]="id + '-draft'"
              #composer
              rows="1"
              placeholder="Type a message"
              enterkeyhint="send"
              autocomplete="off"
              [attr.maxlength]="maxLength"
              [attr.aria-describedby]="nearLimit() ? id + '-count' : null"
              [value]="draft()"
              (input)="edit($event)"
              (keydown.enter)="enter($event)"
            ></textarea>
            <button class="send" type="submit" aria-label="Send" [disabled]="!canSend()">
              <app-icon name="send" [size]="24" />
            </button>
            @if (nearLimit()) {
              <p [id]="id + '-count'" class="count muted">{{ draft().length }} of {{ maxLength }} characters</p>
            }
          </form>

          @if (picking()) {
            <app-chat-event-picker
              [familyId]="familyId()"
              [timeZone]="timeZone()"
              [members]="members()"
              (picked)="pick($event)"
              (closed)="closePicker()"
            />
          }
        }
      }
    }
  `,
  styleUrl: './chat-conversation.scss',
})
export class ChatConversation implements OnInit {
  /** Whether messages may be marked read: false while the compact chat is minimized. */
  readonly active = input(true);
  /** The heading level for the co-parent's name: 1 on the Messages page, 2 in the compact chat. */
  readonly level = input<1 | 2>(1);
  /** Put focus in the message box once the conversation shows (opening the compact chat). */
  readonly focusOnReady = input(false);

  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly chat = inject(ChatStore);
  private readonly injector = inject(Injector);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly pickerButton = viewChild<ElementRef<HTMLButtonElement>>('pickerButton');

  private static next = 0;
  protected readonly id = `chat-${ChatConversation.next++}`;
  protected readonly picking = signal(false);
  protected readonly draftEvent = this.chat.draftEvent;
  protected readonly familyId = computed(() => this.auth.currentFamily()?.id ?? '');
  protected readonly timeZone = computed(() => this.auth.currentFamily()?.timeZone ?? 'UTC');

  protected readonly maxLength = MESSAGE_MAX_LENGTH;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly olderError = signal<string | null>(null);
  protected readonly loadingOlder = signal(false);
  protected readonly members = this.chat.members;
  protected readonly atBottom = signal(true);
  private readonly visible = signal(typeof document === 'undefined' || document.visibilityState === 'visible');
  /** The first unread message when the conversation opened; the divider stays there while the page is open. */
  protected readonly dividerBefore = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly messages = computed(() => this.chat.messages() ?? []);
  protected readonly pending = this.chat.pending;
  protected readonly hasOlder = this.chat.hasOlder;
  protected readonly typing = this.chat.coParentTyping;
  protected readonly draft = this.chat.draft;

  protected readonly coParent = computed(() => this.members().find((m) => !m.isYou && m.role === 'Parent') ?? null);
  protected readonly name = computed(() => this.coParent()?.displayName.split(/\s+/)[0] ?? 'your co-parent');
  protected readonly canSend = computed(
    () => (this.draft().trim().length > 0 || this.draftEvent() !== null) && this.draft().length <= MESSAGE_MAX_LENGTH,
  );
  protected readonly nearLimit = computed(() => this.draft().length > MESSAGE_MAX_LENGTH - 200);

  /** "Read" goes under the latest of your messages the co-parent has read. */
  protected readonly readReceipt = computed(() => {
    const list = this.messages();
    const through = list.findIndex((m) => m.id === this.chat.coParentReadThrough());
    for (let i = through; i >= 0; i--) {
      if (list[i].yours) {
        return list[i].id;
      }
    }
    return null;
  });

  /** The co-parent's messages after your read position: some arrived while you were scrolled up. */
  private readonly unreadOnScreen = computed(() => {
    const list = this.messages();
    const read = list.findIndex((m) => m.id === this.chat.yourReadThrough());
    return list.some((m, i) => i > read && !m.yours);
  });
  protected readonly newBelow = computed(() => this.state() === 'ready' && !this.atBottom() && this.unreadOnScreen());

  constructor() {
    const onVisibility = () => this.visible.set(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));

    // Read only what's on screen, in a visible tab, while the conversation is open.
    effect(() => {
      const list = this.messages();
      if (!this.active() || this.state() !== 'ready' || !this.visible() || !this.atBottom() || !this.unreadOnScreen()) {
        return;
      }
      const latest = list[list.length - 1];
      untracked(() => void this.chat.markRead(latest.id));
    });

    // Follow the conversation when already at the latest message; otherwise offer "New messages below".
    let last: string | undefined;
    effect(() => {
      const list = this.messages();
      const latest = list[list.length - 1];
      // Also follow this device's own sends, the typing line and a reload after reconnecting.
      this.pending();
      this.typing();
      this.chat.reloaded();
      if (latest && last !== undefined && latest.id !== last && !latest.yours) {
        untracked(() => this.announcement.set(`${this.senderName(latest.senderMembershipId)}: ${this.describe(latest)}`));
      }
      last = latest?.id ?? last;
      if (untracked(() => this.atBottom())) {
        untracked(() => this.scrollToLatest(false));
      }
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    const familyId = this.auth.currentFamily()?.id;
    if (!familyId) {
      this.error.set('We couldn’t find your family.');
      this.state.set('error');
      return;
    }
    this.error.set(null);
    // Switching between the page and the compact chat shows what's loaded at once, then refreshes it.
    const loaded = this.chat.messages() !== null && this.members().length > 0;
    if (loaded) {
      this.ready();
    } else {
      this.state.set('loading');
    }
    try {
      const [family] = await Promise.all([this.api.family(familyId), this.chat.open()]);
      this.members.set(family.members);
      if (!loaded) {
        this.ready();
      }
    } catch (error) {
      if (!loaded) {
        this.error.set(generalMessage(toProblem(error)));
        this.state.set('error');
      }
    }
  }

  private ready(): void {
    this.dividerBefore.set(this.firstUnread());
    this.state.set('ready');
    afterNextRender(
      () => {
        this.openAtUnread();
        if (this.focusOnReady()) {
          this.composer()?.nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
  }

  protected senderName(membershipId: string): string {
    return membershipId === this.coParent()?.membershipId ? this.name() : 'Former parent';
  }

  protected onScroll(): void {
    const log = this.log()?.nativeElement;
    if (log) {
      this.atBottom.set(log.scrollHeight - log.scrollTop - log.clientHeight <= BOTTOM_SLACK_PX);
    }
  }

  protected edit(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.draft.set(text);
    if (text.trim()) {
      this.chat.typed();
    }
  }

  /** Enter sends; Shift+Enter adds a line. Not while an input method is still composing a word. */
  protected enter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) {
      return;
    }
    event.preventDefault();
    this.send();
  }

  protected send(event?: Event): void {
    event?.preventDefault();
    if (!this.canSend()) {
      return;
    }
    const text = this.draft();
    const shared = this.draftEvent();
    this.draft.set('');
    this.draftEvent.set(null);
    this.atBottom.set(true);
    void this.chat.send(text, shared);
    const composer = this.composer()?.nativeElement;
    if (composer) {
      // Set directly too: Enter can come before the page has re-rendered the text it just received.
      composer.value = '';
      composer.focus();
    }
  }

  protected retry(clientMessageId: string): void {
    void this.chat.retry(clientMessageId);
  }

  protected sendWithoutEvent(clientMessageId: string): void {
    void this.chat.sendWithoutEvent(clientMessageId);
  }

  protected discard(clientMessageId: string): void {
    this.chat.discard(clientMessageId);
    this.composer()?.nativeElement.focus();
  }

  /** The words for a message: its text, or the event it shares. */
  protected describe(message: Pick<ChatMessage, 'text' | 'event'>): string {
    return message.text || (message.event?.available && message.event.title ? `Shared ${message.event.title}` : 'Shared an event');
  }

  /** The chosen event goes in the draft, to review before sending; focus goes to the message box. */
  protected pick(card: ChatEventCard): void {
    this.draftEvent.set(card);
    this.picking.set(false);
    afterNextRender(() => this.composer()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closing the search returns focus to the button that opened it. */
  protected closePicker(): void {
    this.picking.set(false);
    afterNextRender(() => this.pickerButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected removeDraftEvent(): void {
    this.draftEvent.set(null);
    this.composer()?.nativeElement.focus();
  }

  protected async loadOlder(): Promise<void> {
    const log = this.log()?.nativeElement;
    const fromEnd = log ? log.scrollHeight - log.scrollTop : 0;
    this.loadingOlder.set(true);
    this.olderError.set(null);
    try {
      await this.chat.loadOlder();
    } catch (error) {
      this.olderError.set(generalMessage(toProblem(error)));
    } finally {
      this.loadingOlder.set(false);
    }
    // Keep the messages that were on screen where they were.
    afterNextRender(
      () => {
        const element = this.log()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight - fromEnd;
          if (!this.hasOlder()) {
            element.focus();
          }
        }
      },
      { injector: this.injector },
    );
  }

  protected scrollToLatest(focus: boolean): void {
    afterNextRender(
      () => {
        const log = this.log()?.nativeElement;
        if (!log) {
          return;
        }
        log.scrollTop = log.scrollHeight;
        this.onScroll();
        if (focus) {
          log.focus();
        }
      },
      { injector: this.injector },
    );
  }

  /** Opens at the "New messages" divider when there is one, otherwise at the latest message. */
  private openAtUnread(): void {
    const log = this.log()?.nativeElement;
    if (!log) {
      return;
    }
    const divider = log.querySelector<HTMLElement>('.divider');
    log.scrollTop = divider ? divider.offsetTop - 8 : log.scrollHeight;
    this.onScroll();
  }

  private firstUnread(): string | null {
    const list = this.messages();
    const read = list.findIndex((m) => m.id === this.chat.yourReadThrough());
    return list.find((m, i) => i > read && !m.yours)?.id ?? null;
  }
}
