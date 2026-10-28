import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { dayOfMonth, todayIn } from '../dashboard/week';
import { resultType, resultWhen } from './calendar-search';
import { toItems } from './calendar-items';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };
const SEARCH = `${F}/calendar/events/search`;

const FINAL = event({ id: 'final', title: 'Soccer final', startsAt: '2027-03-06T15:00:00Z', endsAt: '2027-03-06T16:00:00Z' });
const CAMP = event({
  id: 'camp',
  title: 'Soccer camp with a very long title that keeps going so it has to wrap across several lines on a phone',
  startsAt: '2026-07-06T05:00:00Z',
  endsAt: '2026-07-09T05:00:00Z',
  allDay: true,
});
const PLAY = event({ id: 'play', title: 'Soccer play', category: 'Joint', status: 'PendingApproval', startsAt: '2027-03-08T23:00:00Z', endsAt: '2027-03-09T00:00:00Z' });

describe('calendar search (#253)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open() {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create('/calendar?date=2026-10-20&view=list');
    http = TestBed.inject(HttpTestingController);
    const load = await vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/events`);
      expect(found.length).toBeGreaterThan(0);
      return found[found.length - 1];
    });
    for (const r of http.match((r) => r.url === `${F}/calendar/reminders`)) r.flush([]);
    for (const r of http.match((r) => r.url === `${F}/calendar/tasks`)) r.flush([]);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    load.flush([]);
    await settle();
  }

  const pill = () => document.querySelector('app-calendar-search .search-pill') as HTMLButtonElement;
  const field = () => document.querySelector('#calendar-search-field') as HTMLInputElement | null;
  const panel = () => document.querySelector('.panel[role="dialog"]') as HTMLElement | null;
  const cards = () => [...document.querySelectorAll<HTMLButtonElement>('.panel .card')];
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function type(value: string) {
    const input = field()!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  /** The upcoming and past requests for one search. */
  async function searches(): Promise<[TestRequest, TestRequest]> {
    return vi.waitFor(() => {
      const found = http.match((r) => r.url === SEARCH);
      expect(found.length).toBe(2);
      const upcoming = found.find((r) => r.request.params.get('past') === 'false')!;
      const past = found.find((r) => r.request.params.get('past') === 'true')!;
      return [upcoming, past];
    });
  }

  async function search(value: string, upcoming: CalendarEvent[], past: CalendarEvent[], more = { upcoming: false, past: false }) {
    pill().click();
    await settle();
    await type(value);
    const [u, p] = await searches();
    u.flush({ events: upcoming, hasMore: more.upcoming });
    p.flush({ events: past, hasMore: more.past });
    await settle();
    return [u, p] as const;
  }

  afterEach(() => {
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  it('sits beside Today with a magnifier and today’s day of the month in the family’s time zone', async () => {
    await open();

    const today = todayIn('America/Chicago', new Date());
    const toolbar = pill().closest('.period')!;
    expect([...toolbar.children].map((c) => c.tagName.toLowerCase()).slice(-2)).toEqual(['button', 'app-calendar-search']);
    expect(text(pill().querySelector('.glyph'))).toBe(dayOfMonth(today));
    expect(pill().getAttribute('aria-label')).toMatch(/^Search events\. Today is /);
    expect(pill().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a focused field, asks the server for both groups and shows past results under a labelled divider', async () => {
    await open();
    pill().click();
    await settle();

    expect(panel()).not.toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));
    expect(text(document.querySelector('#calendar-search-status'))).toMatch(/title, event type or date/);

    await type('soccer');
    const [u, p] = await searches();
    expect(u.request.params.get('q')).toBe('soccer');
    expect(u.request.params.get('limit')).toBe('10');
    u.flush({ events: [FINAL, PLAY], hasMore: false });
    p.flush({ events: [CAMP], hasMore: false });
    await settle();

    expect(cards().map((c) => text(c.querySelector('.card__title')))).toEqual(['Soccer final', 'Soccer play', CAMP.title]);
    const divider = document.querySelector('.panel .divider')!;
    expect(text(divider)).toBe('Past events');
    expect(divider.compareDocumentPosition(cards()[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A pending proposal says so; it never reads as confirmed.
    expect(text(cards()[1])).toContain('Pending approval');
    expect(text(cards()[1])).toContain('Family event');
    expect(text(document.querySelector('#calendar-search-status'))).toBe('2 upcoming and 1 past events found.');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('only sends the latest text after typing stops', async () => {
    await open();
    pill().click();
    await settle();

    await type('so');
    await type('soc');
    await type('socce');
    const [u] = await searches();

    expect(u.request.params.get('q')).toBe('socce');
  });

  it('turns event types, parents and dates into server filters', async () => {
    await open();
    pill().click();
    await settle();

    await type('Sam parenting time');
    const [typed] = await searches();
    expect(typed.request.params.getAll('category')).toEqual(['ParentingTime']);
    expect(typed.request.params.get('caregiver')).toBe('m-sam');

    await type('Oct 12');
    const [dated] = await searches();
    expect(dated.request.params.get('on')).toMatch(/^\d{4}-10-12$/);
    expect(dated.request.params.has('q')).toBe(false);
  });

  it('says when nothing matches, and offers a retry after an error', async () => {
    await open();
    await search('zebra', [], []);
    expect(text(document.querySelector('#calendar-search-status'))).toBe('No events match.');
    expect(cards()).toEqual([]);

    await type('zebras');
    const [u, p] = await searches();
    u.flush('boom', { status: 500, statusText: 'Server error' });
    p.flush({ events: [], hasMore: false });
    await settle();
    expect(text(document.querySelector('#calendar-search-status'))).toBe('We couldn’t search the calendar.');

    (document.querySelector('.panel .more') as HTMLButtonElement).click();
    const [again] = await searches();
    expect(again.request.params.get('q')).toBe('zebras');
  });

  it('shows one group cleanly and loads more of it on request', async () => {
    await open();
    await search('soccer', [], [CAMP], { upcoming: false, past: true });

    expect(document.querySelector('.panel .divider')).not.toBeNull();
    const more = [...document.querySelectorAll<HTMLButtonElement>('.panel .more')];
    expect(more.map(text)).toEqual(['Show more past events']);

    more[0].click();
    const next = await vi.waitFor(() => http.expectOne((r) => r.url === SEARCH));
    expect(next.request.params.get('offset')).toBe('1');
    expect(next.request.params.get('past')).toBe('true');
    next.flush({ events: [event({ id: 'older', title: 'Soccer tryouts', startsAt: '2026-05-01T15:00:00Z', endsAt: '2026-05-01T16:00:00Z' })], hasMore: false });
    await settle();
    expect(cards().length).toBe(2);
    expect(document.querySelector('.panel .more')).toBeNull();
  });

  it('moves through results with the arrow keys and closes on Escape, returning focus to the button', async () => {
    await open();
    await search('soccer', [FINAL], [CAMP]);

    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(cards()[0]);
    cards()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(cards()[1]);
    cards()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(cards()[0]);

    cards()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(pill());
  });

  it('opens the chosen event’s existing details on its date', async () => {
    await open();
    await search('soccer', [FINAL], []);

    cards()[0].click();
    await settle();

    const router = TestBed.inject(Router);
    expect(router.url).toContain('date=2027-03-06');
    expect(router.url).toContain('event=final');
    expect(panel()).toBeNull();
  });

  it('describes dates, ranges and event types plainly', () => {
    const [final, camp] = toItems([FINAL, CAMP], MEMBERS, CHILDREN, 'America/Chicago');
    const [sams] = toItems(
      [event({ category: 'ParentingTime', caregiverMembershipId: 'm-sam', startsAt: '2027-01-02T06:00:00Z', endsAt: '2027-01-04T06:00:00Z', allDay: true })],
      MEMBERS,
      CHILDREN,
      'America/Chicago',
    );

    expect(resultWhen(final)).toBe('Mar 6, 2027 · 9:00 AM – 10:00 AM');
    expect(resultWhen(camp)).toBe('Jul 6, 2026 – Jul 8, 2026');
    expect(resultType(sams)).toBe('Parenting time · Sam');
    expect(resultType(final)).toBe('Activity');
  });
});
