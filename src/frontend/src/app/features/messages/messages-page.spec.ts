import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, ChatConversation, ChatMessage, FamilyMember } from '../../core/api/api';
import { CHAT_CONNECTION, ChatConnection } from '../../core/chat/chat.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { MessagesPage } from './messages-page';

// Synthetic family only: Alex (this parent) and Jamie. The API and the hub are faked; the page's behaviour is under test.
const ALEX: FamilyMember = { membershipId: 'm-alex', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '', isYou: true };
const JAMIE: FamilyMember = { membershipId: 'm-jamie', displayName: 'Jamie Rivera', role: 'Parent', joinedAt: '', isYou: false };

const message = (id: string, text: string, yours = false): ChatMessage => ({
  id,
  clientMessageId: `client-${id}`,
  senderMembershipId: yours ? 'm-alex' : 'm-jamie',
  yours,
  text,
  sentAt: '2026-11-06T15:00:00Z',
});

const conversation = (overrides: Partial<ChatConversation> = {}): ChatConversation => ({
  yourMembershipId: 'm-alex',
  messages: [
    message('1', 'Can you do the soccer pickup on Saturday?'),
    message('2', 'Yes, I can. What time is it again?', true),
    message('3', 'Game ends at 11:30, so pickup around 11:45 at the field.'),
    message('4', 'Thanks! Can you also bring the water bottles?'),
  ],
  hasOlder: false,
  yourReadThrough: '2',
  coParentReadThrough: '2',
  ...overrides,
});

class FakeConnection implements ChatConnection {
  readonly handlers = new Map<string, (payload: never) => void>();
  on(event: string, handler: (payload: never) => void): void {
    this.handlers.set(event, handler);
  }
  onreconnected(): void {
    /* not used here */
  }
  onclose(): void {
    /* not used here */
  }
  async start(): Promise<void> {
    /* connected */
  }
  async stop(): Promise<void> {
    /* closed */
  }
  async invoke(): Promise<unknown> {
    return undefined;
  }
  push(event: string, payload: unknown): void {
    this.handlers.get(event)!(payload as never);
  }
}

describe('Messages page (#125)', () => {
  let page: ChatConversation;
  let members: FamilyMember[];
  let connection: FakeConnection;

  async function render() {
    connection = new FakeConnection();
    const api = {
      family: vi.fn(async () => ({ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '', members })),
      conversation: vi.fn(async (_family: string, before?: string) =>
        before ? conversation({ messages: [message('0', 'An older message')], hasOlder: false }) : page,
      ),
      sendMessage: vi.fn(async (_family: string, clientMessageId: string, text: string) => ({
        ...message('5', text, true),
        clientMessageId,
      })),
      markRead: vi.fn(async () => undefined),
      chatUnread: vi.fn(async () => ({ count: 0, hasUnread: false })),
      typing: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fakeAuth(),
        { provide: Api, useValue: api },
        { provide: CHAT_CONNECTION, useValue: async () => connection },
      ],
    });
    const fixture = TestBed.createComponent(MessagesPage);
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const bubbles = (el: HTMLElement) => [...el.querySelectorAll('.message')];
  const composer = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('textarea')!;

  function type(el: HTMLElement, value: string) {
    composer(el).value = value;
    composer(el).dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    page = conversation();
    members = [ALEX, JAMIE];
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the co-parent and the conversation, oldest first, with a labelled composer', async () => {
    const { el } = await render();

    expect(text(el.querySelector('h1'))).toBe('Messages with Jamie Rivera');
    expect(bubbles(el).map((b) => b.classList.contains('message--yours'))).toEqual([false, true, false, false]);
    expect(text(el.querySelector('label[for="chat-draft"]'))).toBe('Message Jamie');
    expect(composer(el).getAttribute('placeholder')).toBe('Type a message');
    // Each bubble says who wrote it for screen readers.
    expect(text(bubbles(el)[1].querySelector('.bubble'))).toMatch(/^You, Nov 6, \d+:00 (AM|PM): Yes, I can/);
  });

  it('puts New messages before the first unread message and Read under the latest one the co-parent read', async () => {
    const { el } = await render();
    const items = [...el.querySelectorAll('.messages > li')];

    expect(items.map((li) => (li.classList.contains('divider') ? 'divider' : text(li.querySelector('.bubble')).slice(-12)))).toEqual([
      'on Saturday?',
      'is it again?',
      'divider',
      't the field.',
      'ter bottles?',
    ]);
    expect(text(el.querySelector('.divider'))).toBe('New messages');
    expect(el.querySelectorAll('.status')).toHaveLength(1);
    expect(text(items[1].querySelector('.status'))).toBe('Read');
  });

  it('marks the latest message read while the conversation is on screen', async () => {
    const { api } = await render();

    expect(api.markRead).toHaveBeenCalledWith('family-1', '4');
  });

  it('marks nothing read while the tab is in the background', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { fixture, api } = await render();
    expect(api.markRead).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(fixture);

    expect(api.markRead).toHaveBeenCalledWith('family-1', '4');
  });

  it('sends with Enter and keeps the draft on Shift+Enter', async () => {
    const { fixture, api, el } = await render();
    type(el, 'I’ll bring the water bottles.');

    composer(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(api.sendMessage).not.toHaveBeenCalled();

    composer(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);

    expect(api.sendMessage).toHaveBeenCalledWith('family-1', expect.any(String), 'I’ll bring the water bottles.');
    expect(composer(el).value).toBe('');
    expect(text(bubbles(el).at(-1)!.querySelector('.bubble'))).toContain('I’ll bring the water bottles.');
    expect(document.activeElement).toBe(composer(el));
  });

  it('can’t send an empty message', async () => {
    const { el } = await render();
    const send = el.querySelector<HTMLButtonElement>('button.send')!;

    expect(send.getAttribute('aria-label')).toBe('Send');
    expect(send.disabled).toBe(true);
    type(el, '   ');
    expect(send.disabled).toBe(true);
  });

  it('keeps a failed message as Not sent, and Retry sends the same message again', async () => {
    const { fixture, api, el } = await render();
    api.sendMessage.mockRejectedValueOnce(new Error('offline'));
    type(el, 'I’ll bring the water bottles.');
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('button.send')!.click();
    await settle(fixture);

    const failed = el.querySelector('.message--failed')!;
    expect(text(failed.querySelector('.not-sent'))).toBe('Not sent');
    const retry = failed.querySelector<HTMLButtonElement>('button')!;
    expect(retry.getAttribute('aria-label')).toBe('Retry sending: I’ll bring the water bottles.');

    retry.click();
    await settle(fixture);

    const ids = api.sendMessage.mock.calls.map((call) => call[1]);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    expect(el.querySelector('.message--failed')).toBeNull();
  });

  it('shows and announces the co-parent typing, and announces their new message', async () => {
    const { fixture, el } = await render();

    connection.push('typing', { membershipId: 'm-jamie' });
    await settle(fixture);
    expect(text(el.querySelector('.typing'))).toBe('Jamie is typing…');

    connection.push('message', message('9', 'See you at 11:45'));
    await settle(fixture);
    expect(text(el.querySelector('.typing'))).toBe('');
    expect([...el.querySelectorAll('[aria-live="polite"]')].map(text)).toContain('Jamie: See you at 11:45');
  });

  it('tells the co-parent this parent is typing, but not for blank space', async () => {
    const { api, el } = await render();

    type(el, '  ');
    expect(api.typing).not.toHaveBeenCalled();
    type(el, 'Sure');
    expect(api.typing).toHaveBeenCalledTimes(1);
  });

  it('loads earlier messages above the ones already shown', async () => {
    page = conversation({ hasOlder: true });
    const { fixture, api, el } = await render();

    el.querySelector<HTMLButtonElement>('button.older')!.click();
    await settle(fixture);

    expect(api.conversation).toHaveBeenLastCalledWith('family-1', '1');
    expect(text(bubbles(el)[0].querySelector('.bubble'))).toContain('An older message');
    expect(el.querySelector('button.older')).toBeNull();
  });

  it('explains how to start when there is no co-parent yet', async () => {
    members = [ALEX];
    page = conversation({ messages: [], yourReadThrough: null, coParentReadThrough: null });
    const { el } = await render();

    expect(text(el)).toContain('No one to message yet');
    expect(el.querySelector('a[href="/settings"]')).not.toBeNull();
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('says plainly when the conversation can’t load, and can try again', async () => {
    const { fixture, api, el } = await render();
    api.conversation.mockRejectedValueOnce(new Error('offline'));
    fixture.componentInstance['load']();
    await settle(fixture);

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.note button')!.click();
    await settle(fixture);
    expect(bubbles(el)).toHaveLength(4);
  });

  it('has no automatically detectable accessibility issues', async () => {
    const { el } = await render();

    expect(await axeViolations(el)).toEqual([]);
  });
});
