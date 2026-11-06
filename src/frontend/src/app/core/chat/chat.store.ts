import { Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api, ChatMessage } from '../api/api';
import { AuthStore } from '../auth/auth.store';

/** The parts of a SignalR hub connection the store uses, so tests can stand in for the server. */
export interface ChatConnection {
  on(event: string, handler: (payload: never) => void): void;
  onreconnected(handler: () => void): void;
  onclose(handler: (error?: Error) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(method: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Opens the listen-only connection to `/hubs/chat` (ADR-0008). The SignalR client is loaded only when a parent is
 * signed in. It uses the session cookie; the server checks the page's origin and the parent's membership.
 */
export const CHAT_CONNECTION = new InjectionToken<() => Promise<ChatConnection>>('chat connection', {
  providedIn: 'root',
  factory: () => async () => {
    const signalr = await import('@microsoft/signalr');
    return new signalr.HubConnectionBuilder()
      .withUrl('/hubs/chat')
      .withAutomaticReconnect()
      .configureLogging(signalr.LogLevel.Warning)
      .build() as unknown as ChatConnection;
  },
});

/** A message this device is sending, or failed to send. Retrying reuses its `clientMessageId`, so it can't duplicate. */
export interface PendingMessage {
  readonly clientMessageId: string;
  readonly text: string;
  readonly state: 'sending' | 'failed';
}

/** How long the co-parent's "typing" lasts without another signal. */
export const TYPING_SHOWN_MS = 6000;
/** At most one "typing" signal this often (the server allows 30 a minute). */
export const TYPING_EVERY_MS = 3000;
const RESTART_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * The parents' conversation (#125, docs/design/m4-chat.md): the messages loaded so far, this device's unsent ones, both
 * read positions, the co-parent's typing, and the unread count for the navigation dot. REST is the source of truth;
 * the live connection only says something changed, and the conversation reloads after a reconnect.
 *
 * Children never get here: the store connects only for a signed-in parent, and the API refuses child sessions anyway.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly connect = inject(CHAT_CONNECTION);

  /** The family whose conversation this is: the signed-in parent's current family. */
  readonly familyId = computed(() => {
    const family = this.auth.currentFamily();
    return this.auth.status() === 'signed-in' && family?.role === 'Parent' ? family.id : null;
  });

  readonly membershipId = signal<string | null>(null);
  /** Sent messages, oldest first; null until the conversation is opened. */
  readonly messages = signal<readonly ChatMessage[] | null>(null);
  readonly pending = signal<readonly PendingMessage[]>([]);
  readonly hasOlder = signal(false);
  readonly yourReadThrough = signal<string | null>(null);
  readonly coParentReadThrough = signal<string | null>(null);
  readonly coParentTyping = signal(false);
  /** Unread messages from the co-parent, up to 99. */
  readonly unread = signal(0);
  /** The composer's text, kept while the parent moves around the app (cleared on sign-out). */
  readonly draft = signal('');
  /** Bumped when a reconnect reloads the conversation, so the page can recheck what's on screen. */
  readonly reloaded = signal(0);

  private connection: ChatConnection | null = null;
  private generation = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  private reading: string | null = null;

  readonly hasUnread = computed(() => this.unread() > 0);

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      untracked(() => void this.switchTo(familyId));
    });
  }

  /** Loads the latest page. Throws when it can't, so the page can say so. */
  async open(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    const page = await this.api.conversation(familyId);
    if (familyId !== this.familyId()) {
      return;
    }
    this.membershipId.set(page.yourMembershipId);
    this.messages.set(page.messages);
    this.hasOlder.set(page.hasOlder);
    this.yourReadThrough.set(page.yourReadThrough);
    this.coParentReadThrough.set(page.coParentReadThrough);
  }

  /** The page before the first loaded message. */
  async loadOlder(): Promise<void> {
    const familyId = this.familyId();
    const first = this.messages()?.[0];
    if (!familyId || !first) {
      return;
    }
    const page = await this.api.conversation(familyId, first.id);
    if (familyId !== this.familyId()) {
      return;
    }
    this.messages.update((current) => merge(page.messages, current ?? []));
    this.hasOlder.set(page.hasOlder);
  }

  /** Sends the text as a new message. It shows at once as "sending", and stays as "Not sent" if it fails. */
  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const message: PendingMessage = { clientMessageId: crypto.randomUUID(), text: trimmed, state: 'sending' };
    this.pending.update((list) => [...list, message]);
    await this.deliver(message);
  }

  /** Sends a failed message again with the same id: the server returns the stored copy if the first try got through. */
  async retry(clientMessageId: string): Promise<void> {
    const message = this.pending().find((p) => p.clientMessageId === clientMessageId);
    if (!message || message.state === 'sending') {
      return;
    }
    await this.deliver(message);
  }

  /**
   * Marks the conversation read up to `messageId`. Only call it for messages on screen in an open conversation in a
   * visible tab (the handoff's default); a minimized window or background tab never marks anything read.
   */
  async markRead(messageId: string): Promise<void> {
    const familyId = this.familyId();
    if (!familyId || this.reading === messageId || this.yourReadThrough() === messageId) {
      return;
    }
    this.reading = messageId;
    try {
      await this.api.markRead(familyId, messageId);
      this.advanceYours(messageId);
      await this.refreshUnread();
    } catch {
      // Best effort: the next visible message or reload tries again.
    } finally {
      this.reading = null;
    }
  }

  /** Tells the co-parent this parent is typing, at most once every few seconds. Nothing is stored. */
  typed(): void {
    const familyId = this.familyId();
    const now = Date.now();
    if (!familyId || now - this.lastTypingSent < TYPING_EVERY_MS) {
      return;
    }
    this.lastTypingSent = now;
    this.api.typing(familyId).catch(() => undefined);
  }

  async refreshUnread(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    try {
      const unread = await this.api.chatUnread(familyId);
      if (familyId === this.familyId()) {
        this.unread.set(unread.count);
      }
    } catch {
      // Keep the last known count; the dot is a hint, not a record.
    }
  }

  private async deliver(message: PendingMessage): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    this.setPending(message.clientMessageId, 'sending');
    try {
      const sent = await this.api.sendMessage(familyId, message.clientMessageId, message.text);
      if (familyId !== this.familyId()) {
        return;
      }
      this.pending.update((list) => list.filter((p) => p.clientMessageId !== message.clientMessageId));
      this.receive(sent);
      this.advanceYours(sent.id);
    } catch {
      this.setPending(message.clientMessageId, 'failed');
    }
  }

  private setPending(clientMessageId: string, state: PendingMessage['state']): void {
    this.pending.update((list) => list.map((p) => (p.clientMessageId === clientMessageId ? { ...p, state } : p)));
  }

  /** Adds a sent message once, whichever arrives first: the send's answer or the live copy. */
  private receive(message: ChatMessage): void {
    const me = this.membershipId();
    const own = { ...message, yours: me !== null ? message.senderMembershipId === me : message.yours };
    this.messages.update((current) => (current === null ? current : merge(current, [own])));
    if (own.yours) {
      this.pending.update((list) => list.filter((p) => p.clientMessageId !== own.clientMessageId));
    } else {
      this.stopTyping();
    }
  }

  /** Read positions only move forward. */
  private advanceYours(messageId: string): void {
    if (this.isAfter(messageId, this.yourReadThrough())) {
      this.yourReadThrough.set(messageId);
    }
  }

  private isAfter(messageId: string, current: string | null): boolean {
    const list = this.messages();
    if (current === null || list === null) {
      return true;
    }
    const next = list.findIndex((m) => m.id === messageId);
    const now = list.findIndex((m) => m.id === current);
    return next === -1 || now === -1 || next > now;
  }

  private stopTyping(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    this.coParentTyping.set(false);
  }

  private async switchTo(familyId: string | null): Promise<void> {
    const generation = ++this.generation;
    this.membershipId.set(null);
    this.messages.set(null);
    this.pending.set([]);
    this.hasOlder.set(false);
    this.yourReadThrough.set(null);
    this.coParentReadThrough.set(null);
    this.unread.set(0);
    this.draft.set('');
    this.stopTyping();
    await this.disconnect();
    if (familyId) {
      void this.refreshUnread();
      await this.start(familyId, generation, 0);
    }
  }

  /** Connects and watches the family. If the server can't be reached, tries again later; REST keeps working. */
  private async start(familyId: string, generation: number, attempt: number): Promise<void> {
    if (generation !== this.generation) {
      return;
    }
    let connection: ChatConnection;
    try {
      connection = await this.connect();
      if (generation !== this.generation) {
        return;
      }
      this.connection = connection;
      this.listen(connection, familyId, generation);
      await connection.start();
      await connection.invoke('Watch', familyId);
    } catch {
      if (generation !== this.generation) {
        return;
      }
      await this.disconnect();
      const delay = RESTART_DELAYS_MS[Math.min(attempt, RESTART_DELAYS_MS.length - 1)];
      this.restartTimer = setTimeout(() => void this.start(familyId, generation, attempt + 1), delay);
      return;
    }
    if (attempt > 0) {
      await this.caughtUp(generation);
    }
  }

  private listen(connection: ChatConnection, familyId: string, generation: number): void {
    const current = () => generation === this.generation;
    connection.on('message', (message: ChatMessage) => {
      if (!current()) {
        return;
      }
      this.receive(message);
      void this.refreshUnread();
    });
    connection.on('read', (read: { membershipId: string; messageId: string }) => {
      if (!current()) {
        return;
      }
      if (read.membershipId === this.membershipId()) {
        this.advanceYours(read.messageId);
        void this.refreshUnread();
      } else if (this.isAfter(read.messageId, this.coParentReadThrough())) {
        this.coParentReadThrough.set(read.messageId);
      }
    });
    connection.on('typing', (typing: { membershipId: string }) => {
      // Before the conversation is opened this device doesn't know which parent it is, so it can't tell typing apart.
      if (!current() || this.membershipId() === null || typing.membershipId === this.membershipId()) {
        return;
      }
      this.stopTyping();
      this.coParentTyping.set(true);
      this.typingTimer = setTimeout(() => this.coParentTyping.set(false), TYPING_SHOWN_MS);
    });
    // Group membership doesn't survive a reconnect: watch again, then reload what was missed.
    connection.onreconnected(() => {
      if (!current()) {
        return;
      }
      void connection
        .invoke('Watch', familyId)
        .then(() => this.caughtUp(generation))
        .catch(() => connection.stop());
    });
    connection.onclose(() => {
      if (!current() || this.connection !== connection) {
        return;
      }
      this.connection = null;
      this.restartTimer = setTimeout(() => void this.start(familyId, generation, 1), RESTART_DELAYS_MS[1]);
    });
  }

  /** After a reconnect, pushes may have been missed: reload the latest page and the unread count. */
  private async caughtUp(generation: number): Promise<void> {
    if (generation !== this.generation) {
      return;
    }
    await this.refreshUnread();
    const familyId = this.familyId();
    const loaded = this.messages();
    if (!familyId || loaded === null) {
      return;
    }
    try {
      const page = await this.api.conversation(familyId);
      if (generation !== this.generation) {
        return;
      }
      const overlaps = loaded.length === 0 || page.messages.some((m) => m.id === loaded[loaded.length - 1].id);
      this.messages.set(overlaps ? merge(loaded, page.messages) : page.messages);
      if (!overlaps) {
        this.hasOlder.set(page.hasOlder);
      }
      if (page.yourReadThrough) {
        this.advanceYours(page.yourReadThrough);
      }
      this.coParentReadThrough.set(page.coParentReadThrough);
      this.pending.update((list) => list.filter((p) => !page.messages.some((m) => m.clientMessageId === p.clientMessageId)));
      this.reloaded.update((n) => n + 1);
    } catch {
      // The page still shows what it had; the next reconnect or visit reloads.
    }
  }

  private async disconnect(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      await connection.stop().catch(() => undefined);
    }
  }
}

/** Joins two runs of messages in conversation order, once each. `before` comes first. */
function merge(before: readonly ChatMessage[], after: readonly ChatMessage[]): readonly ChatMessage[] {
  const seen = new Set(before.map((m) => m.id));
  return [...before, ...after.filter((m) => !seen.has(m.id))];
}
