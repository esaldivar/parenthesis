import { TestBed } from '@angular/core/testing';
import { Api, ChatConversation, ChatMessage } from '../api/api';
import { fakeAuth } from '../../../testing/fake-auth';
import { AuthStore } from '../auth/auth.store';
import { CHAT_CONNECTION, ChatConnection, ChatStore, TYPING_SHOWN_MS } from './chat.store';

// Synthetic family only: Alex (this parent) and Sam. The server and the hub are faked.
const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  clientMessageId: `client-${id}`,
  senderMembershipId: 'm-sam',
  yours: false,
  text: `Message ${id}`,
  sentAt: '2026-11-06T15:00:00Z',
  ...overrides,
});

const page = (overrides: Partial<ChatConversation> = {}): ChatConversation => ({
  yourMembershipId: 'm-alex',
  messages: [message('1'), message('2', { senderMembershipId: 'm-alex', yours: true })],
  hasOlder: false,
  yourReadThrough: '1',
  coParentReadThrough: '1',
  ...overrides,
});

class FakeConnection implements ChatConnection {
  readonly handlers = new Map<string, (payload: never) => void>();
  reconnected: (() => void) | null = null;
  closed: ((error?: Error) => void) | null = null;
  readonly invoked: unknown[][] = [];
  started = 0;
  stopped = 0;
  failStart = false;

  on(event: string, handler: (payload: never) => void): void {
    this.handlers.set(event, handler);
  }
  onreconnected(handler: () => void): void {
    this.reconnected = handler;
  }
  onclose(handler: (error?: Error) => void): void {
    this.closed = handler;
  }
  async start(): Promise<void> {
    this.started++;
    if (this.failStart) {
      throw new Error('offline');
    }
  }
  async stop(): Promise<void> {
    this.stopped++;
  }
  async invoke(method: string, ...args: unknown[]): Promise<unknown> {
    this.invoked.push([method, ...args]);
    return undefined;
  }
  push(event: string, payload: unknown): void {
    this.handlers.get(event)!(payload as never);
  }
}

describe('ChatStore (#125)', () => {
  let connection: FakeConnection;
  let api: {
    conversation: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    chatUnread: ReturnType<typeof vi.fn>;
    typing: ReturnType<typeof vi.fn>;
  };

  async function create(options: Parameters<typeof fakeAuth>[0] = {}) {
    connection = new FakeConnection();
    api = {
      conversation: vi.fn(async () => page()),
      sendMessage: vi.fn(async (_f: string, clientMessageId: string, text: string) =>
        message('3', { clientMessageId, text, senderMembershipId: 'm-alex', yours: true }),
      ),
      markRead: vi.fn(async () => undefined),
      chatUnread: vi.fn(async () => ({ count: 2, hasUnread: true })),
      typing: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [fakeAuth(options), { provide: Api, useValue: api }, { provide: CHAT_CONNECTION, useValue: async () => connection }],
    });
    const store = TestBed.inject(ChatStore);
    TestBed.tick();
    await vi.waitFor(() => expect(connection.invoked).toContainEqual(['Watch', 'family-1']));
    return store;
  }

  afterEach(() => vi.useRealTimers());

  it('watches the parent’s family and loads the unread count for the navigation dot', async () => {
    const store = await create();

    expect(connection.started).toBe(1);
    await vi.waitFor(() => expect(store.unread()).toBe(2));
    expect(store.hasUnread()).toBe(true);
  });

  it('never connects for a family where the signed-in person isn’t a parent', async () => {
    connection = new FakeConnection();
    const factory = vi.fn(async () => connection);
    TestBed.configureTestingModule({
      providers: [
        fakeAuth({ families: [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Child' }] }),
        { provide: Api, useValue: { chatUnread: vi.fn() } },
        { provide: CHAT_CONNECTION, useValue: factory },
      ],
    });
    TestBed.inject(ChatStore);
    TestBed.tick();
    await Promise.resolve();

    expect(factory).not.toHaveBeenCalled();
  });

  it('shows a send at once, then swaps in the stored message', async () => {
    const store = await create();
    await store.open();

    const sending = store.send('  On my way  ');
    expect(store.pending()).toEqual([expect.objectContaining({ text: 'On my way', state: 'sending' })]);
    await sending;

    expect(store.pending()).toEqual([]);
    expect(store.messages()!.map((m) => m.text)).toEqual(['Message 1', 'Message 2', 'On my way']);
    expect(store.yourReadThrough()).toBe('3');
  });

  it('keeps a failed send as Not sent, and retries it with the same client message id', async () => {
    const store = await create();
    await store.open();
    api.sendMessage.mockRejectedValueOnce(new Error('offline'));

    await store.send('Bring the water bottles');
    const [failed] = store.pending();
    expect(failed.state).toBe('failed');

    await store.retry(failed.clientMessageId);

    expect(api.sendMessage.mock.calls.map((c) => c[1])).toEqual([failed.clientMessageId, failed.clientMessageId]);
    expect(store.pending()).toEqual([]);
    expect(store.messages()!.filter((m) => m.text === 'Bring the water bottles')).toHaveLength(1);
  });

  it('adds a message once when the live copy and the send’s answer both arrive', async () => {
    const store = await create();
    await store.open();

    // The pushed copy carries the sender's view with `yours` false; this device decides from the sender id.
    connection.push('message', message('3', { senderMembershipId: 'm-alex', yours: false, clientMessageId: 'c', text: 'Hi' }));
    await store.send('Hi');

    expect(store.messages()!.filter((m) => m.id === '3')).toEqual([expect.objectContaining({ yours: true })]);
  });

  it('adds the co-parent’s live message, ends their typing, and refreshes the unread count', async () => {
    const store = await create();
    await store.open();
    connection.push('typing', { membershipId: 'm-sam' });
    expect(store.coParentTyping()).toBe(true);
    api.chatUnread.mockResolvedValueOnce({ count: 3, hasUnread: true });

    connection.push('message', message('9', { text: 'Game ends at 11:30' }));

    expect(store.coParentTyping()).toBe(false);
    expect(store.messages()!.at(-1)!.text).toBe('Game ends at 11:30');
    await vi.waitFor(() => expect(store.unread()).toBe(3));
  });

  it('shows the co-parent typing only briefly, and never this parent’s own typing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = await create();
    await store.open();

    connection.push('typing', { membershipId: 'm-alex' });
    expect(store.coParentTyping()).toBe(false);
    connection.push('typing', { membershipId: 'm-sam' });
    expect(store.coParentTyping()).toBe(true);
    vi.advanceTimersByTime(TYPING_SHOWN_MS);
    expect(store.coParentTyping()).toBe(false);
  });

  it('sends typing at most once every few seconds', async () => {
    const store = await create();

    store.typed();
    store.typed();
    store.typed();

    expect(api.typing).toHaveBeenCalledTimes(1);
  });

  it('moves read receipts forward only', async () => {
    const store = await create();
    await store.open();

    connection.push('read', { membershipId: 'm-sam', messageId: '2' });
    expect(store.coParentReadThrough()).toBe('2');
    connection.push('read', { membershipId: 'm-sam', messageId: '1' });
    expect(store.coParentReadThrough()).toBe('2');
  });

  it('marks read once per message and clears the unread count', async () => {
    const store = await create();
    await store.open();
    api.chatUnread.mockResolvedValue({ count: 0, hasUnread: false });

    await Promise.all([store.markRead('2'), store.markRead('2')]);

    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(store.yourReadThrough()).toBe('2');
    expect(store.unread()).toBe(0);
  });

  it('watches again after reconnecting and catches up on missed messages', async () => {
    const store = await create();
    await store.open();
    api.conversation.mockResolvedValueOnce(page({ messages: [...page().messages, message('5', { text: 'Missed' })] }));

    connection.reconnected!();

    await vi.waitFor(() => expect(store.messages()!.map((m) => m.id)).toEqual(['1', '2', '5']));
    expect(connection.invoked.filter(([method]) => method === 'Watch')).toHaveLength(2);
    expect(store.reloaded()).toBe(1);
  });

  it('keeps trying to connect when the server can’t be reached, without breaking messaging', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    connection = new FakeConnection();
    connection.failStart = true;
    TestBed.configureTestingModule({
      providers: [
        fakeAuth(),
        { provide: Api, useValue: { chatUnread: vi.fn(async () => ({ count: 0, hasUnread: false })) } },
        { provide: CHAT_CONNECTION, useValue: async () => connection },
      ],
    });
    TestBed.inject(ChatStore);
    TestBed.tick();
    await vi.waitFor(() => expect(connection.started).toBe(1));

    connection.failStart = false;
    await vi.advanceTimersByTimeAsync(2000);

    expect(connection.started).toBe(2);
    expect(connection.invoked).toContainEqual(['Watch', 'family-1']);
  });

  it('forgets the conversation and the draft when the parent signs out', async () => {
    const store = await create();
    await store.open();
    store.draft.set('Half-written');

    TestBed.inject(AuthStore).status.set('anonymous');
    TestBed.tick();

    await vi.waitFor(() => expect(connection.stopped).toBe(1));
    expect(store.messages()).toBeNull();
    expect(store.draft()).toBe('');
  });
});
