import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, CalendarEvent, ChatConversation, ChatMessage, FamilyMember } from '../../core/api/api';
import { CHAT_CONNECTION, ChatConnection } from '../../core/chat/chat.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { MessagesPage } from './pages/messages-page/messages-page.component';
import { PICKER_DEBOUNCE_MS } from './components/event-picker/event-picker.component';

// Slice 2 of docs/design/m4-chat.md: calendar event cards. Synthetic family only: Alex (this parent) and Jamie.
const ALEX: FamilyMember = { membershipId: 'm-alex', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '', isYou: true };
const JAMIE: FamilyMember = { membershipId: 'm-jamie', displayName: 'Jamie Rivera', role: 'Parent', joinedAt: '', isYou: false };

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    id: 'e-soccer',
    title: 'Soccer game',
    category: 'Activity',
    // Saturday November 7, 10:30 AM in Chicago.
    startsAt: '2026-11-07T16:30:00Z',
    endsAt: '2026-11-07T18:00:00Z',
    allDay: false,
    location: null,
    notes: null,
    status: 'Confirmed',
    childIds: [],
    caregiverMembershipId: null,
    ownerMembershipId: 'm-alex',
    confirmedBeforeCoParentJoined: false,
    changeRequestId: null,
    pendingChange: 'None',
    proposed: null,
    warnings: [],
    ...overrides,
  }) as CalendarEvent;

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

describe('sharing calendar events in Messages (#125, slice 2)', () => {
  let page: ChatConversation;
  let found: CalendarEvent[];
  let connection: FakeConnection;

  async function render() {
    connection = new FakeConnection();
    const api = {
      family: vi.fn(async () => ({ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '', members: [ALEX, JAMIE] })),
      conversation: vi.fn(async () => page),
      sendMessage: vi.fn(async (_f: string, clientMessageId: string, text: string, eventId?: string | null) =>
        message('9', {
          clientMessageId,
          text,
          senderMembershipId: 'm-alex',
          yours: true,
          eventId: eventId ?? null,
          event: eventId ? { id: eventId, available: true, title: 'Soccer game', startsAt: '2026-11-07T16:30:00Z', status: 'Confirmed' } : null,
        }),
      ),
      chatMessage: vi.fn(async (_f: string, id: string) =>
        message(id, { eventId: 'e-play', event: { id: 'e-play', available: true, title: 'School play', startsAt: '2026-11-09T00:00:00Z', status: 'Proposed' } }),
      ),
      searchCalendarEvents: vi.fn(async (_f: string, _criteria: unknown, paging: { past: boolean }) => ({
        events: paging.past ? [] : found,
        hasMore: false,
      })),
      markRead: vi.fn(async () => undefined),
      chatUnread: vi.fn(async () => ({ count: 0, hasUnread: false })),
      typing: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fakeAuth(), { provide: Api, useValue: api }, { provide: CHAT_CONNECTION, useValue: async () => connection }],
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
  const button = (within: Element, label: string) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? text(b)) === label)!;

  async function search(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, el: HTMLElement, value: string) {
    const input = el.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, PICKER_DEBOUNCE_MS + 20));
    await settle(fixture);
  }

  beforeEach(() => {
    found = [event()];
    page = {
      yourMembershipId: 'm-alex',
      messages: [
        message('1', { text: 'Here’s the game info.', eventId: 'e-soccer', event: { id: 'e-soccer', available: true, title: 'Soccer game', startsAt: '2026-11-07T16:30:00Z', status: 'Confirmed' } }),
        message('2', { text: 'And the play?', eventId: 'e-play', event: { id: 'e-play', available: true, title: 'School play', startsAt: '2026-11-09T00:00:00Z', status: 'Proposed' } }),
        message('3', { text: 'That one moved.', eventId: 'e-gone', event: { id: 'e-gone', available: false } }),
      ],
      hasOlder: false,
      yourReadThrough: '3',
      coParentReadThrough: null,
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a shared event as a card that opens it on the Calendar, on its date in the family’s time zone', async () => {
    const { el } = await render();
    const card = el.querySelector<HTMLAnchorElement>('.message a.card')!;

    expect(text(card)).toBe('Open in calendar: Soccer game, Sat, Nov 7, 10:30 AM');
    expect(card.getAttribute('href')).toBe('/calendar?date=2026-11-07&event=e-soccer');
  });

  it('never makes a proposal look confirmed', async () => {
    const { el } = await render();

    expect(text(el.querySelectorAll('.message')[1].querySelector('app-chat-event-card .status'))).toBe(', Pending approval');
    expect(el.querySelectorAll('.message')[0].querySelector('app-chat-event-card .status')).toBeNull();
  });

  it('says when a shared event is no longer on the calendar, with no link and nothing else about it', async () => {
    const { el } = await render();
    const gone = el.querySelectorAll('.message')[2];

    expect(text(gone.querySelector('app-chat-event-card'))).toBe('This event isn’t on your calendar any more.');
    expect(gone.querySelector('a')).toBeNull();
  });

  it('finds an event by name, puts it in the draft to review, and sends it with the message', async () => {
    const { fixture, api, el } = await render();
    const open = button(el, 'Share a calendar event');
    open.click();
    await settle(fixture);
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(text(dialog.querySelector('h2'))).toBe('Find a calendar event');
    await vi.waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('input')));

    await search(fixture, el, 'soccer');
    expect(api.searchCalendarEvents).toHaveBeenCalledWith('family-1', expect.objectContaining({ q: 'soccer' }), expect.anything());
    expect(text(el.querySelector('[role="dialog"] [role="status"]'))).toBe('1 event found.');
    el.querySelector<HTMLButtonElement>('[role="dialog"] .result')!.click();
    await settle(fixture);

    // The picker closes, the event waits in the draft, and focus is back in the message box.
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(text(el.querySelector('.draft-event'))).toContain('Soccer game');
    expect(document.activeElement).toBe(el.querySelector('textarea'));
    const send = el.querySelector<HTMLButtonElement>('button.send')!;
    expect(send.disabled).toBe(false); // an event alone can be sent

    send.click();
    await settle(fixture);
    expect(api.sendMessage).toHaveBeenCalledWith('family-1', expect.any(String), '', 'e-soccer');
    expect(el.querySelector('.draft-event')).toBeNull();
  });

  it('searches by date too, and says plainly when nothing matches', async () => {
    found = [];
    const { fixture, api, el } = await render();
    button(el, 'Share a calendar event').click();
    await settle(fixture);

    await search(fixture, el, 'Nov 7');

    expect(api.searchCalendarEvents).toHaveBeenCalledWith('family-1', expect.objectContaining({ on: '2026-11-07', q: null }), expect.anything());
    expect(text(el.querySelector('[role="dialog"] [role="status"]'))).toBe('No events match. Try another name or date.');
  });

  it('closes with Escape and returns focus to the search button; a chosen event can be removed', async () => {
    const { fixture, el } = await render();
    const open = button(el, 'Share a calendar event');
    open.click();
    await settle(fixture);
    el.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    await vi.waitFor(() => expect(document.activeElement).toBe(button(el, 'Share a calendar event')));

    button(el, 'Share a calendar event').click();
    await settle(fixture);
    await search(fixture, el, 'soccer');
    el.querySelector<HTMLButtonElement>('[role="dialog"] .result')!.click();
    await settle(fixture);
    button(el, 'Remove Soccer game from the message').click();
    await settle(fixture);

    expect(el.querySelector('.draft-event')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('textarea'));
  });

  it('reads the card for itself when a shared event arrives live', async () => {
    const { fixture, api, el } = await render();

    connection.push('message', message('7', { text: 'What about this?', eventId: 'e-play', event: null }));
    await settle(fixture);

    expect(api.chatMessage).toHaveBeenCalledWith('family-1', '7');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(el.querySelectorAll('.message')[3].querySelector('app-chat-event-card'))).toContain('School play');
    });
  });

  it('keeps a message whose event went away as Not sent, and can send its text alone', async () => {
    const { fixture, api, el } = await render();
    const { HttpErrorResponse } = await import('@angular/common/http');
    api.sendMessage.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 400, error: { errors: { eventId: ['That event isn’t on your calendar any more.'] } } }),
    );
    button(el, 'Share a calendar event').click();
    await settle(fixture);
    await search(fixture, el, 'soccer');
    el.querySelector<HTMLButtonElement>('[role="dialog"] .result')!.click();
    await settle(fixture);
    const box = el.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = 'See you there';
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('button.send')!.click();
    await settle(fixture);

    const failed = el.querySelector('.message--failed')!;
    expect(text(failed.querySelector('.not-sent'))).toBe('Not sent. That event isn’t on your calendar any more.');
    expect([...failed.querySelectorAll('button')].map(text)).toEqual(['Send without it', 'Discard']);

    button(failed, 'Send without it').click();
    await settle(fixture);
    const [first, second] = api.sendMessage.mock.calls;
    expect(second[1]).toBe(first[1]);
    expect(second[3]).toBeUndefined();
    expect(el.querySelector('.message--failed')).toBeNull();
  });

  it('has no automatically detectable accessibility issues, with the picker open', async () => {
    const { fixture, el } = await render();
    expect(await axeViolations(el)).toEqual([]);

    button(el, 'Share a calendar event').click();
    await settle(fixture);
    await search(fixture, el, 'soccer');
    expect(await axeViolations(el)).toEqual([]);
  });
});
