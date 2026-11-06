import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Api, ChatMessage, FamilyMember } from '../../core/api/api';
import { CHAT_CONNECTION, ChatConnection, ChatStore } from '../../core/chat/chat.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { ChatDock } from './chat-dock';
import { MessagesPage } from './messages-page';

// Slice 2 of docs/design/m4-chat.md: the compact desktop chat. Synthetic family only: Alex (this parent) and Jamie.
const ALEX: FamilyMember = { membershipId: 'm-alex', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '', isYou: true };
const JAMIE: FamilyMember = { membershipId: 'm-jamie', displayName: 'Jamie Rivera', role: 'Parent', joinedAt: '', isYou: false };

const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  clientMessageId: `client-${id}`,
  senderMembershipId: 'm-jamie',
  yours: false,
  text: `Message ${id}`,
  sentAt: '2026-11-06T15:00:00Z',
  ...overrides,
});

class FakeConnection implements ChatConnection {
  readonly handlers = new Map<string, (payload: never) => void>();
  on(name: string, handler: (payload: never) => void): void {
    this.handlers.set(name, handler);
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
  push(name: string, payload: unknown): void {
    this.handlers.get(name)!(payload as never);
  }
}

/** A page behind the compact chat, to show it stays usable. */
@Component({
  selector: 'app-behind',
  imports: [ChatDock],
  template: `<main id="main-content" tabindex="-1"><button type="button" class="behind" (click)="clicks = clicks + 1">Next week</button></main><app-chat-dock />`,
})
class Behind {
  clicks = 0;
}

@Component({ template: '' })
class Blank {}

describe('the compact desktop chat (#125, slice 2)', () => {
  let connection: FakeConnection;

  async function render() {
    connection = new FakeConnection();
    const api = {
      family: vi.fn(async () => ({ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '', members: [ALEX, JAMIE] })),
      conversation: vi.fn(async () => ({
        yourMembershipId: 'm-alex',
        messages: [message('1', { text: 'Can you do the soccer pickup on Saturday?' })],
        hasOlder: false,
        yourReadThrough: '1',
        coParentReadThrough: null,
      })),
      markRead: vi.fn(async () => undefined),
      chatUnread: vi.fn(async () => ({ count: 0, hasUnread: false })),
      typing: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'messages', component: MessagesPage },
          { path: 'calendar', component: Blank },
        ]),
        fakeAuth(),
        { provide: Api, useValue: api },
        { provide: CHAT_CONNECTION, useValue: async () => connection },
      ],
    });
    const fixture = TestBed.createComponent(Behind);
    document.body.appendChild(fixture.nativeElement);
    const chat = TestBed.inject(ChatStore);
    await settle(fixture);
    return { fixture, api, chat, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (within: Element, label: string) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)!;

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows nothing until it’s opened', async () => {
    const { el } = await render();

    expect(el.querySelector('app-chat-dock')!.children).toHaveLength(0);
  });

  it('docks the conversation with Expand, Minimize and Close, without blocking the page behind it', async () => {
    const { fixture, chat, el } = await render();
    chat.dock.set('open');
    await settle(fixture);
    const dock = el.querySelector('section.dock')!;

    expect(dock.getAttribute('aria-label')).toBe('Compact chat');
    expect(text(dock.querySelector('h2'))).toBe('Messages with Jamie Rivera');
    expect([...dock.querySelectorAll('.chat-header button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Share a calendar event',
      'Expand to full chat',
      'Minimize chat',
      'Close chat',
    ]);
    // Not a modal: no dialog role, no backdrop; the page's own controls still work.
    expect(el.querySelector('[aria-modal]')).toBeNull();
    el.querySelector<HTMLButtonElement>('button.behind')!.click();
    expect(fixture.componentInstance.clicks).toBe(1);
    expect(await axeViolations(el)).toEqual([]);
  });

  it('keeps the draft and the chosen event through Minimize and back, and moves focus with it', async () => {
    const { fixture, chat, el } = await render();
    chat.dock.set('open');
    await settle(fixture);
    const box = el.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = 'I’ll bring the water bottles.';
    box.dispatchEvent(new Event('input'));
    chat.draftEvent.set({ id: 'e-soccer', available: true, title: 'Soccer game', startsAt: '2026-11-07T16:30:00Z', status: 'Confirmed' });
    await settle(fixture);

    button(el, 'Minimize chat').click();
    await settle(fixture);
    const restore = el.querySelector<HTMLButtonElement>('.bar .restore')!;
    expect(el.querySelector('section.dock')).toBeNull();
    expect(text(restore)).toBe('Messages. Open the compact chat');
    await vi.waitFor(() => expect(document.activeElement).toBe(restore));

    restore.click();
    await settle(fixture);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('I’ll bring the water bottles.');
    expect(text(el.querySelector('.draft-event'))).toContain('Soccer game');
    await vi.waitFor(() => expect(document.activeElement).toBe(el.querySelector('textarea')));
  });

  it('marks nothing read while minimized, and shows the unread dot on its bar', async () => {
    const { fixture, api, chat, el } = await render();
    chat.dock.set('minimized');
    await settle(fixture);
    api.chatUnread.mockResolvedValue({ count: 1, hasUnread: true });

    connection.push('message', message('2', { text: 'Game ends at 11:30.' }));
    await settle(fixture);

    expect(api.markRead).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(el.querySelector('.restore'))).toContain('unread messages');
    });
  });

  it('expands to the full Messages page, and Close puts it away with focus on the page', async () => {
    const { fixture, chat, el } = await render();
    chat.dock.set('open');
    await settle(fixture);

    button(el, 'Expand to full chat').click();
    await settle(fixture);
    expect(TestBed.inject(Router).url).toBe('/messages');
    expect(chat.dock()).toBe('closed');

    chat.dock.set('open');
    await settle(fixture);
    button(el, 'Close chat').click();
    await settle(fixture);
    expect(el.querySelector('section')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(el.querySelector('#main-content')));
  });

  it('Minimize on the full page docks the same conversation over the page the parent came from', async () => {
    const { fixture, chat } = await render();
    chat.returnUrl.set('/calendar');
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/messages');
    const page = TestBed.createComponent(MessagesPage);
    await settle(page);

    page.nativeElement.querySelector('button[aria-label="Minimize to compact chat"]').click();
    await settle(fixture);

    expect(chat.dock()).toBe('open');
    expect(router.url).toBe('/calendar');
  });
});
