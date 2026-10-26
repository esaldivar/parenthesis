import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ComingSoonPage } from '../../shared/coming-soon/coming-soon-page';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { axeViolations } from '../../../testing/axe';
import { AuthStore } from '../../core/auth/auth.store';
import { fakeAuth } from '../../../testing/fake-auth';
import { LiveDashboardDataSource } from './dashboard-data';
import { DashboardWeek } from './model';
import { DashboardPage, NOW } from './dashboard-page';
import { MIN_SLOTS } from './timeline';
import { toastText } from '../../../testing/toasts';

// Wednesday, October 14, 2026, 9:00 AM in the fake family's time zone (America/Chicago).
const WEDNESDAY_MORNING = new Date('2026-10-14T14:00:00Z');

describe('DashboardPage (approved design)', () => {
  /** A live week with nothing in it: what a new family sees. */
  const EMPTY_WEEK: DashboardWeek = {
    source: 'live',
    children: [],
    parentingTime: [],
    events: [],
    pendingReviews: [],
    kidShares: [],
    recentMessages: [],
    recentMemories: [],
    notes: [],
  };

  async function render(options: { sample?: boolean; failingSource?: boolean; week?: string; live?: DashboardWeek; load?: () => Promise<DashboardWeek | null> } = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        fakeAuth(),
        { provide: NOW, useValue: () => WEDNESDAY_MORNING },
      ],
    });
    let calls = 0;
    TestBed.overrideProvider(LiveDashboardDataSource, {
      useValue: {
        load: () => (++calls, options.load ? options.load() : options.failingSource ? Promise.reject(new Error('offline')) : Promise.resolve(options.live ?? EMPTY_WEEK)),
      },
    });
    const fixture = TestBed.createComponent(DashboardPage);
    if (options.sample) {
      fixture.componentRef.setInput('sample', '1');
    }
    if (options.week) {
      fixture.componentRef.setInput('week', options.week);
    }
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement, calls: () => calls };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (el: HTMLElement, label: string | RegExp) =>
    [...el.querySelectorAll('button')].find((b) =>
      typeof label === 'string' ? text(b) === label || b.getAttribute('aria-label') === label : label.test(text(b)),
    )!;
  const link = (el: HTMLElement, label: string) => [...el.querySelectorAll('a')].find((a) => text(a).startsWith(label))!;

  describe('layout and live data', () => {
    it('greets the parent like the approved design', async () => {
      const { el } = await render();

      expect(text(el.querySelector('h1'))).toBe('Good morning, Alex!');
      expect(text(el.querySelector('.welcome__sub'))).toBe('Here’s what’s happening with your family.');
    });

    it('has the approved sections in order', async () => {
      const { el } = await render();

      expect([...el.querySelectorAll('h2')].map(text)).toEqual([
        'This week, October 11 – 17, 2026',
        'Upcoming',
        'Quick Add',
        'From Your Kids',
        'Recent Messages',
        'Family Memories',
      ]);
    });

    it('opens on the current Sunday-to-Saturday week with today marked', async () => {
      const { el } = await render();

      const heads = [...el.querySelectorAll('.grid__head')].map((h) => text(h.querySelector('.grid__weekday')));
      expect(heads).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      expect(text(el.querySelector('[aria-current="date"]'))).toContain('Wednesday, October 14, today');
    });

    it('shows an empty live week plainly, with no sample content, and is honest about what isn’t built yet', async () => {
      const { el } = await render();

      expect(el.querySelector('.sample-banner')).toBeNull();
      expect(text(el.querySelector('.area-upcoming'))).toContain('Nothing else this week');
      expect(text(el.querySelector('.area-messages'))).toContain('Messaging between parents isn’t available yet');
    });

    it('opens Add to calendar from Event and Note, and keeps Message and Memory marked unavailable', async () => {
      const { el } = await render();
      const actions = [...el.querySelectorAll<HTMLElement>('.quick__btn')];

      expect(actions.map(text)).toEqual(['Event', 'Message', 'Memory', 'Note']);
      expect(actions[0].getAttribute('href')).toBe('/calendar/new?date=2026-10-14');
      expect(actions[3].getAttribute('href')).toBe('/calendar/new?date=2026-10-14&kind=reminder');
      expect([actions[1], actions[2]].every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(text(el.querySelector('#quick-note'))).toBe('Messages and memories open here when they’re ready.');
    });

    it('lists approvals first, then the week’s events, reminders and tasks in time order', async () => {
      const kai = { id: 'kai', name: 'Kai' };
      const { el } = await render({
        live: {
          ...EMPTY_WEEK,
          pendingReviews: [{ id: 'r1', summary: 'Change Time with Sam', proposedBy: 'Sam' }],
          events: [{ id: 'e1', title: 'Soccer practice', date: '2026-10-15', time: '17:00', category: 'sport', children: [kai], status: 'confirmed' }],
          notes: [
            { id: 'n1', kind: 'reminder', title: 'Spirit Day', date: '2026-10-14', time: '08:00', children: [kai] },
            { id: 'n2', kind: 'task', title: 'Science fair poster', date: '2026-10-16', children: [] },
            { id: 'n3', kind: 'task', title: 'Last week’s task', date: '2026-10-12', children: [] },
          ],
        },
      });

      const items = [...el.querySelectorAll('.upcoming__item')];
      expect(items.map((i) => text(i.querySelector('.upcoming__title')))).toEqual([
        'Change Time with Sam',
        'Spirit Day',
        'Soccer practice',
        'Science fair poster',
      ]);
      expect(text(items[1].querySelector('.upcoming__when'))).toBe('Reminder · Wed, Oct 14 · 8:00 AM');
      expect(text(items[3].querySelector('.upcoming__when'))).toBe('Task · due Friday, October 16');
      // Reminders and tasks stay off the week calendar (owner decision).
      expect(text(el.querySelector('app-week-calendar'))).not.toContain('Spirit Day');
    });

    // Issue #208: the desktop week grid left out every event without a time.
    it('shows all-day and multi-day events across their dates in the all-day row, and on each day of the list', async () => {
      const { el } = await render({
        live: {
          ...EMPTY_WEEK,
          events: [
            { id: 'trip', title: 'Field trip', date: '2026-10-15', category: 'school', children: [], status: 'confirmed' },
            { id: 'off', title: 'Teacher workday', date: '2026-10-16', endDate: '2026-10-17', category: 'other', children: [], status: 'confirmed' },
            { id: 'camp', title: 'Soccer camp', date: '2026-10-13', endDate: '2026-10-14', time: '08:00', category: 'sport', children: [], status: 'proposed' },
            { id: 'away', title: 'You’re unavailable', date: '2026-10-12', category: 'unavailable', children: [], status: 'confirmed' },
            { id: 'swim', title: 'Swim lesson', date: '2026-10-14', time: '17:00', durationMinutes: 60, category: 'sport', children: [], status: 'confirmed' },
          ],
        },
      });

      const row = [...el.querySelectorAll<HTMLElement>('.allday li.act--allday')];
      expect(row.map((li) => [text(li.querySelector('.act__title')), li.style.getPropertyValue('--start'), li.style.getPropertyValue('--end')])).toEqual([
        ['Field trip', '5', '6'], // Thursday.
        ['Teacher workday', '6', '8'], // Friday and Saturday.
        ['Soccer camp', '3', '5'], // Tuesday and Wednesday.
        ['You’re unavailable', '2', '3'], // Monday.
      ]);
      // A proposal in the all-day row still says so, in words.
      expect(text(row[2])).toContain('Proposed');
      // Single-day timed events stay in the hour grid, and only there.
      expect(text(el.querySelector('.grid__body'))).toContain('Swim lesson');
      expect(text(el.querySelector('.grid__body'))).not.toContain('Field trip');
      // The day list shows a multi-day event on each of its days.
      const days = [...el.querySelectorAll('.agenda__day')].map((d) => text(d));
      expect(days[5]).toContain('Teacher workday');
      expect(days[6]).toContain('Teacher workday');
      expect(days[6]).toContain('Oct 16 – Oct 17 · All day');
    });

    it('moves between weeks and returns with Today', async () => {
      const { fixture, el } = await render();

      button(el, 'Next week').click();
      await settle(fixture);
      expect(text(el.querySelector('#week-heading'))).toBe('Week of October 18 – 24, 2026');
      expect(el.querySelector('[aria-current="date"]')).toBeNull();

      button(el, 'Today').click();
      await settle(fixture);
      expect(text(el.querySelector('#week-heading'))).toBe('This week, October 11 – 17, 2026');

      button(el, 'Previous week').click();
      await settle(fixture);
      expect(text(el.querySelector('#week-heading'))).toBe('Week of October 4 – 10, 2026');
    });

    it('opens Month on the full Calendar page with the selected week preserved', async () => {
      const { fixture, el } = await render();

      button(el, 'Next week').click();
      await settle(fixture);

      expect(link(el, 'Month').getAttribute('href')).toBe('/calendar?view=month&week=2026-10-18');
      expect(link(el, 'See all').getAttribute('href')).toBe('/calendar?view=list&week=2026-10-18');
    });

    it('starts on the week passed back from the Calendar page', async () => {
      const { el } = await render({ week: '2026-10-21' });

      expect(text(el.querySelector('#week-heading'))).toBe('Week of October 18 – 24, 2026');
    });

    it('explains a failure and can try again', async () => {
      const { fixture, el, calls } = await render({ failingSource: true });

      expect(text(el.querySelector('[role="alert"]'))).toContain('We couldn’t load this week.');
      button(el, 'Try again').click();
      await settle(fixture);
      expect(calls()).toBe(2);
    });

    it('distinguishes Upcoming loading, failure and an empty successful retry (#208)', async () => {
      let reject!: (reason: Error) => void;
      const pending = new Promise<DashboardWeek>((_, no) => { reject = no; });
      let response: Promise<DashboardWeek> = pending;
      const { fixture, el, calls } = await render({ load: () => response });
      const upcoming = () => el.querySelector<HTMLElement>('.area-upcoming')!;

      expect(upcoming().getAttribute('aria-busy')).toBe('true');
      expect(text(upcoming().querySelector('[role="status"]'))).toBe('Loading upcoming events…');
      expect(upcoming().querySelector('app-empty-state')).toBeNull();

      reject(new Error('offline'));
      await settle(fixture);
      expect(upcoming().getAttribute('aria-busy')).toBe('false');
      expect(text(upcoming().querySelector('[role="alert"]'))).toContain('We couldn’t load upcoming events.');
      expect(upcoming().querySelector('app-empty-state')).toBeNull();

      response = Promise.resolve(EMPTY_WEEK);
      button(upcoming(), 'Try again').click();
      await settle(fixture);
      expect(calls()).toBe(2);
      expect(text(upcoming())).toContain('Nothing else this week');
      expect(upcoming().querySelector('[role="alert"]')).toBeNull();
    });

    it('hides the previous week’s Upcoming while the next week loads, then shows its results (#208)', async () => {
      let resolve!: (week: DashboardWeek) => void;
      const pending = new Promise<DashboardWeek>((yes) => { resolve = yes; });
      const first = { ...EMPTY_WEEK, notes: [{ id: 'old', kind: 'task' as const, title: 'Old week task', date: '2026-10-16', children: [] }] };
      let response: Promise<DashboardWeek> = Promise.resolve(first);
      const { fixture, el } = await render({ load: () => response });
      expect(text(el.querySelector('.area-upcoming'))).toContain('Old week task');

      response = pending;
      button(el, 'Next week').click();
      await settle(fixture);
      expect(text(el.querySelector('.area-upcoming'))).toContain('Loading upcoming events…');
      expect(el.querySelector('.upcoming__item')).toBeNull();

      resolve({ ...EMPTY_WEEK, notes: [{ id: 'new', kind: 'task', title: 'Next week task', date: '2026-10-20', children: [] }] });
      await settle(fixture);
      expect(text(el.querySelector('.area-upcoming'))).toContain('Next week task');
      expect(text(el.querySelector('.area-upcoming'))).not.toContain('Old week task');
    });

    it('keeps unavailable family data distinct from a successfully loaded empty week (#208)', async () => {
      const { el } = await render({ load: () => Promise.resolve(null) });
      expect(text(el.querySelector('.area-upcoming'))).toContain('Nothing to show yet');
      expect(text(el.querySelector('.area-upcoming'))).not.toContain('Nothing else this week');
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { el } = await render();

      expect(await axeViolations(el)).toEqual([]);
    });
  });

  describe('week navigation history (#208)', () => {
    async function routedHome(url = '/') {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: '', component: DashboardPage },
            { path: 'settings', component: ComingSoonPage, data: { heading: 'Settings' } },
          ], withComponentInputBinding()),
          provideLocationMocks(),
          provideHttpClient(),
          provideHttpClientTesting(),
          fakeAuth(),
          { provide: NOW, useValue: () => WEDNESDAY_MORNING },
        ],
      });
      TestBed.overrideProvider(LiveDashboardDataSource, {
        useValue: { load: () => Promise.resolve(EMPTY_WEEK) },
      });
      TestBed.inject(Router).setUpLocationChangeListener();
      const harness = await RouterTestingHarness.create(url);
      await settle(harness.fixture);
      return harness;
    }

    it('keeps the selected week after visiting Settings and going Back', async () => {
      const harness = await routedHome('/?sample=1');
      button(harness.routeNativeElement!, 'Next week').click();
      await settle(harness.fixture);
      expect(TestBed.inject(Router).url).toBe('/?sample=1&week=2026-10-18');

      await harness.navigateByUrl('/settings');
      TestBed.inject(Location).back();
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/?sample=1&week=2026-10-18'));
      await settle(harness.fixture);
      expect(text(harness.routeNativeElement!.querySelector('#week-heading'))).toBe('Week of October 18 – 24, 2026');
    });

    it('responds to a different linked week without keeping an earlier local selection', async () => {
      const harness = await routedHome('/?week=2026-10-21');
      button(harness.routeNativeElement!, 'Next week').click();
      await settle(harness.fixture);
      await harness.navigateByUrl('/?week=2026-11-02');
      await settle(harness.fixture);
      expect(text(harness.routeNativeElement!.querySelector('#week-heading'))).toBe('Week of November 1 – 7, 2026');

      button(harness.routeNativeElement!, 'Today').click();
      await settle(harness.fixture);
      expect(TestBed.inject(Router).url).toBe('/?week=2026-10-11');
      expect(text(harness.routeNativeElement!.querySelector('#week-heading'))).toBe('This week, October 11 – 17, 2026');
    });
  });

  describe('opening an event’s details from the week (#213)', () => {
    const F = '/api/families/family-1';
    const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };
    // Wednesday, October 14, 5:00–6:00 PM in Chicago.
    const SWIM = event({ id: 'swim', title: 'Swim lesson', startsAt: '2026-10-14T22:00:00Z', endsAt: '2026-10-14T23:00:00Z' });
    const WEEKEND = event({
      id: 'weekend',
      title: 'Time with Alex',
      category: 'ParentingTime',
      status: 'PendingApproval',
      allDay: true,
      startsAt: '2026-10-16T05:00:00Z',
      endsAt: '2026-10-18T05:00:00Z',
      caregiverMembershipId: 'm-alex',
    });
    const LIVE: DashboardWeek = {
      ...EMPTY_WEEK,
      parentingTime: [
        {
          id: 'weekend-kai',
          eventId: 'weekend',
          child: { id: 'kai', name: 'Kai' },
          caregiver: { membershipId: 'm-alex', displayName: 'Alex' },
          start: '2026-10-16T00:00',
          end: '2026-10-18T00:00',
          status: 'proposed',
          title: 'Time with Alex',
        },
      ],
      events: [{ id: 'swim', title: 'Swim lesson', date: '2026-10-14', time: '17:00', durationMinutes: 60, category: 'sport', children: [], status: 'confirmed' }],
    };

    const openButton = (el: HTMLElement, title: string, within = '.grid') =>
      [...el.querySelectorAll<HTMLButtonElement>(`${within} button.open`)].find((b) => text(b) === `Open details: ${title}`)!;
    const dialog = () => document.querySelector('app-event-details [role="dialog"]') as HTMLElement | null;

    async function answer(fixture: Parameters<typeof settle>[0], shown: unknown) {
      const http = TestBed.inject(HttpTestingController);
      const found = await vi.waitFor(() => http.expectOne((r) => r.url.startsWith(`${F}/calendar/events/`)));
      for (const r of http.match(F)) r.flush(FAMILY);
      for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
      if (shown) {
        found.flush(shown);
      } else {
        found.flush({ title: 'Not found', status: 404 }, { status: 404, statusText: 'Not Found' });
      }
      await settle(fixture);
      await settle(fixture);
      return http;
    }

    it('allows only Request swap for the other caregiver’s time on Home', async () => {
      const { fixture, el } = await render({ live: LIVE });
      openButton(el, 'Time with Alex', '.agenda').click();
      await answer(fixture, { ...WEEKEND, status: 'Confirmed', caregiverMembershipId: 'm-sam', ownerMembershipId: 'm-alex' });
      expect(text(dialog())).toContain('Request swap');
      expect(text(dialog())).not.toContain('Edit event');
      expect(text(dialog())).not.toContain('Cancel event');
    });

    it('opens the clicked event’s details over the page, and closing returns focus to it, with nothing saved', async () => {
      const { fixture, el } = await render({ live: LIVE });
      // The day list is what narrow screens (and this test's page) show; the grid's blocks work the same way.
      const swim = openButton(el, 'Swim lesson', '.agenda');
      swim.focus();
      swim.click();
      const http = await answer(fixture, SWIM);

      expect(http.match(() => true).filter((r) => r.request.method !== 'GET')).toEqual([]);
      expect(text(dialog()!.querySelector('h2'))).toBe('Swim lesson');
      expect(text(dialog())).toContain('Confirmed');

      (dialog()!.querySelector('button[aria-label="Close details"]') as HTMLElement).click();
      await settle(fixture);
      expect(dialog()).toBeNull();
      await vi.waitFor(() => expect(document.activeElement).toBe(swim));
    });

    it('opens parenting time from its block in the all-day row, showing it’s still waiting for approval', async () => {
      const { fixture, el } = await render({ live: LIVE });
      openButton(el, 'Time with Alex', '.allday').click();
      await answer(fixture, WEEKEND);

      expect(text(dialog()!.querySelector('h2'))).toBe('Time with Alex');
      expect(text(dialog())).toContain('Pending approval');
    });

    it('offers a swap from your unavailable time over your own parenting time, as the Calendar page does', async () => {
      // Alex is unavailable Wednesday afternoon, during Alex's confirmed time with Kai.
      const away = event({
        id: 'away',
        title: 'Unavailable',
        category: 'Unavailable',
        startsAt: '2026-10-14T19:00:00Z',
        endsAt: '2026-10-14T21:00:00Z',
        ownerMembershipId: 'm-alex',
        childIds: [],
      });
      const time = event({
        id: 'time',
        title: 'Time with Alex',
        category: 'ParentingTime',
        allDay: true,
        startsAt: '2026-10-14T05:00:00Z',
        endsAt: '2026-10-16T05:00:00Z',
        caregiverMembershipId: 'm-alex',
      });
      const live: DashboardWeek = {
        ...EMPTY_WEEK,
        events: [{ id: 'away', title: 'You’re unavailable', date: '2026-10-14', time: '14:00', durationMinutes: 120, category: 'unavailable', children: [], status: 'confirmed' }],
      };
      const { fixture, el } = await render({ live });
      openButton(el, 'You’re unavailable', '.agenda').click();
      const http = await answer(fixture, away);
      const overlapping = await vi.waitFor(() =>
        http.expectOne((r) => r.url === `${F}/calendar/events` && r.params.get('from') === away.startsAt && r.params.get('to') === away.endsAt),
      );
      overlapping.flush([time, away]);
      await settle(fixture);
      await settle(fixture);

      expect(text(dialog())).toContain('You can ask to swap it');
      expect([...dialog()!.querySelectorAll('a')].some((a) => text(a).includes('Request parenting time swap'))).toBe(true);
    });

    it('offers each block as a real button, in the list too, so keyboards and screen readers can open it', async () => {
      const { el } = await render({ live: LIVE });

      expect(openButton(el, 'Swim lesson').tagName).toBe('BUTTON');
      expect(openButton(el, 'Swim lesson', '.agenda')).toBeTruthy();
      expect(openButton(el, 'Time with Alex', '.agenda')).toBeTruthy();
    });

    it('says so plainly when the event is gone, and refreshes the week', async () => {
      const { fixture, el, calls } = await render({ live: LIVE });
      const before = calls();
      openButton(el, 'Swim lesson').click();
      await answer(fixture, null);

      expect(dialog()).toBeNull();
      expect(toastText()).toContain('That event isn’t on the calendar any more. The week has been refreshed.');
      expect(calls()).toBe(before + 1);
    });

    it('has no automatically detectable accessibility issues, with the week’s blocks and with details open', async () => {
      const { fixture, el } = await render({ live: LIVE });
      expect(await axeViolations(el)).toEqual([]);
      openButton(el, 'Swim lesson', '.agenda').click();
      await answer(fixture, SWIM);
      expect(dialog()).not.toBeNull();
      expect(await axeViolations(el)).toEqual([]);
    });

    it('offers nothing to open on the sample week', async () => {
      const { el } = await render({ sample: true });
      expect(el.querySelectorAll('button.open')).toHaveLength(0);
    });
  });

  describe('adding from a tap on the week’s empty space (#212)', () => {
    const LIVE: DashboardWeek = {
      ...EMPTY_WEEK,
      events: [{ id: 'swim', title: 'Swim lesson', date: '2026-10-14', time: '17:00', durationMinutes: 60, category: 'sport', children: [], status: 'confirmed' }],
    };
    const column = (el: HTMLElement, label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.slot-add__button')].find((b) => text(b) === `Add on ${label}`)!;

    async function renderWithRouter(live: DashboardWeek | undefined, sample = false) {
      const rendered = await render(sample ? { sample: true } : { live });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      return { ...rendered, navigate };
    }

    it('highlights the hour tapped in the time grid, then opens Add there when the highlight is tapped (#237)', async () => {
      const { fixture, el, navigate } = await renderWithRouter(LIVE);
      const thursday = column(el, 'Thursday, October 15');
      thursday.getBoundingClientRect = () => ({ top: 0, height: 480, left: 0, width: 100 }) as DOMRect;
      thursday.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 165, detail: 1 })); // 8:00 AM.
      await settle(fixture);

      expect(navigate).not.toHaveBeenCalled();
      const pick = el.querySelector<HTMLButtonElement>('.daycol .slot-pick__button')!;
      expect(pick.getAttribute('aria-label')).toBe('Add on Thursday, October 15 at 8:00 AM');
      expect(text(pick)).toBe('8:00 AM');
      pick.click();
      expect(navigate).toHaveBeenCalledWith(['/calendar/new'], { queryParams: { date: '2026-10-15', time: '08:00' } });
    });

    it('from the keyboard, adds on that day', async () => {
      const { el, navigate } = await renderWithRouter(LIVE);
      column(el, 'Thursday, October 15').click();
      expect(navigate).toHaveBeenCalledWith(['/calendar/new'], { queryParams: { date: '2026-10-15' } });
    });

    it('highlights a day of the list tapped on its empty space and adds there on a second tap, never for an activity', async () => {
      const { fixture, el, navigate } = await renderWithRouter(LIVE);
      const days = () => [...el.querySelectorAll<HTMLElement>('.agenda__day')];
      days()[4].querySelector<HTMLElement>('.tap-add__button')!.click(); // Thursday's empty space.
      await settle(fixture);
      expect(navigate).not.toHaveBeenCalled();
      expect(days()[4].classList).toContain('is-picked');

      // Tapping an activity clears the highlight and opens it, never Add.
      days()[3].querySelector<HTMLElement>('button.open')!.click(); // Wednesday's swim lesson.
      await settle(fixture);
      expect(el.querySelector('.slot-pick')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();

      // The same empty space twice adds there.
      days()[4].querySelector<HTMLElement>('.tap-add__button')!.click();
      await settle(fixture);
      days()[4].querySelector<HTMLElement>('.tap-add__button')!.click();
      expect(navigate).toHaveBeenCalledWith(['/calendar/new'], { queryParams: { date: '2026-10-15' } });
    });

    it('offers nothing to add on the sample week', async () => {
      const { el } = await renderWithRouter(undefined, true);
      expect(el.querySelectorAll('.slot-add__button')).toHaveLength(0);
    });
  });

  describe('Home child filter (#261)', () => {
    const kai = { id: 'kai', name: 'Kai' };
    const aurora = { id: 'aurora', name: 'Aurora' };
    const familyEvent = { id: 'family', title: 'Parents-only dinner', date: '2026-10-14', category: 'family' as const, children: [], status: 'proposed' as const };
    const choices = (el: HTMLElement) => [...el.querySelectorAll('.child-filter button')];

    it('keeps child-free events with no children and exposes a single selected all option', async () => {
      const { el } = await render({ live: { ...EMPTY_WEEK, events: [familyEvent] } });
      expect(choices(el).map(text)).toEqual(['Show all kids']);
      expect(choices(el)[0].getAttribute('aria-pressed')).toBe('true');
      expect(text(el.querySelector('app-week-calendar'))).toContain('Parents-only dinner');
      expect(await axeViolations(el)).toEqual([]);
    });

    it('uses the full dynamic child list even with no schedule, including one child and long names', async () => {
      const longName = { id: 'long', name: 'Avery'.repeat(20) };
      let week: DashboardWeek = { ...EMPTY_WEEK, children: [kai] };
      const { fixture, el } = await render({ load: () => Promise.resolve(week) });
      expect(choices(el).map(text)).toEqual(['Show all kids', 'Kai']);
      button(el, 'Kai').click();
      await settle(fixture);
      week = { ...week, children: [kai, aurora, longName, { id: 'robin', name: 'Robin' }] };
      button(el, 'Next week').click();
      await settle(fixture);
      expect(choices(el).map(text)).toEqual(['Show all kids', 'Kai', 'Aurora', longName.name, 'Robin']);
      expect(choices(el).filter((b) => b.getAttribute('aria-pressed') === 'true').map(text)).toEqual(['Kai']);
      expect(el.querySelector('.child-filter')?.getAttribute('aria-label')).toBe('Filter Home calendar by child');
      expect(await axeViolations(el)).toEqual([]);
    });

    it('resets a removed selection and does not revive it if access returns', async () => {
      let week: DashboardWeek = { ...EMPTY_WEEK, children: [kai, aurora], events: [familyEvent] };
      const { fixture, el } = await render({ load: () => Promise.resolve(week) });
      button(el, 'Kai').click();
      await settle(fixture);
      week = { ...week, children: [aurora], events: [{ ...familyEvent, date: '2026-10-21' }] };
      button(el, 'Next week').click();
      await settle(fixture);
      expect(choices(el).map(text)).toEqual(['Show all kids', 'Aurora']);
      expect(button(el, 'Show all kids').getAttribute('aria-pressed')).toBe('true');
      expect(text(el.querySelector('app-week-calendar'))).toContain('Parents-only dinner');
      week = { ...week, children: [kai, aurora] };
      button(el, 'Previous week').click();
      await settle(fixture);
      expect(button(el, 'Show all kids').getAttribute('aria-pressed')).toBe('true');
    });

    it('resets the choice when the family changes, even if an id happens to match', async () => {
      const { fixture, el } = await render({ live: { ...EMPTY_WEEK, children: [kai, aurora] } });
      button(el, 'Kai').click();
      await settle(fixture);
      TestBed.inject(AuthStore).families.set([{ id: 'family-2', name: 'Other synthetic family', timeZone: 'UTC', role: 'Parent' }]);
      await settle(fixture);
      expect(button(el, 'Show all kids').getAttribute('aria-pressed')).toBe('true');
    });

    it('preserves a valid selection through a failed week load and retry', async () => {
      const week = { ...EMPTY_WEEK, children: [kai, aurora] };
      let failing = false;
      const { fixture, el } = await render({ load: () => failing ? Promise.reject(new Error('offline')) : Promise.resolve(week) });
      button(el, 'Aurora').click();
      await settle(fixture);
      failing = true;
      button(el, 'Next week').click();
      await settle(fixture);
      failing = false;
      button(el, 'Try again').click();
      await settle(fixture);
      expect(button(el, 'Aurora').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('sample preview (development builds only)', () => {
    it('labels the data as a fictional sample', async () => {
      const { el } = await render({ sample: true });

      expect(text(el.querySelector('.sample-banner'))).toContain('not your family’s schedule');
    });

    it('shows multi-day parenting time as one continuous block with the parent’s and children’s avatars', async () => {
      const { el } = await render({ sample: true });
      const blocks = [...el.querySelectorAll('.allday > li[data-status="confirmed"]')];

      expect(blocks).toHaveLength(1);
      expect(text(blocks[0].querySelector('.pt__title'))).toBe('Time with Dad');
      expect((blocks[0] as HTMLElement).style.getPropertyValue('--start')).toBe('1');
      expect((blocks[0] as HTMLElement).style.getPropertyValue('--end')).toBe('8');
      const avatars = [...blocks[0].querySelectorAll('app-avatar')].map((a) => [a.getAttribute('title'), a.getAttribute('data-kind')]);
      expect(avatars).toEqual([
        ['Dad', 'parent'],
        ['Aurora', 'child'],
        ['Kai', 'child'],
      ]);
      expect(text(blocks[0])).toContain('Aurora & Kai · Sun, Oct 11 – Sat, Oct 17 · All day');
      expect(text(blocks[0])).not.toMatch(/custody/i);
    });

    it('places activities in their day and time slots beneath parenting time, with child avatars', async () => {
      const { el } = await render({ sample: true });
      const columns = [...el.querySelectorAll('.daycol')];
      const dentist = columns[4].querySelector('.act') as HTMLElement; // Thursday

      expect(text(dentist.querySelector('.act__title'))).toBe('Dentist Appointment');
      expect(dentist.style.gridRow).toBe(`21 / span ${MIN_SLOTS}`); // 10:00 AM in a whole-day grid of 30-minute rows
      expect(dentist.getAttribute('data-category')).toBe('medical');
      expect([...dentist.querySelectorAll('app-avatar')].map((a) => a.getAttribute('title'))).toEqual(['Kai', 'Aurora']);
      expect(text(columns[3])).toContain('Soccer Practice'); // Wednesday
    });

    it('has a calendar key naming each style in text, matching what the sample week shows', async () => {
      const { el } = await render({ sample: true });

      expect([...el.querySelectorAll('.legend li')].map(text)).toEqual([
        'Parenting time',
        'Family event (both parents)',
        'Proposed',
        'Unavailable',
      ]);
      const play = el.querySelector('.act[data-category="family"]')!;
      expect(text(play)).toContain('School Play');
      expect(text(play)).toContain('with Dad and Mom');
      expect([...play.querySelectorAll('app-avatar')].map((a) => a.getAttribute('title'))).toEqual(['Dad', 'Mom', 'Kai', 'Aurora']);
      expect(el.querySelector('.legend')!.getAttribute('aria-label')).toBe('Calendar key');
      const unavailable = el.querySelector('.act[data-category="unavailable"]')!;
      expect(text(unavailable)).toContain('Dad unavailable');
    });

    it('keeps the whole day in a labelled, keyboard-focusable scrolling area below the all-day row', async () => {
      const { el } = await render({ sample: true });
      const scroller = el.querySelector('.grid__body')!;

      expect(scroller.getAttribute('tabindex')).toBe('0');
      expect(scroller.getAttribute('aria-label')).toBe('Activities by time of day, scrollable');
      expect(scroller.querySelectorAll('.daycol')).toHaveLength(7);
      expect(el.querySelector('.grid__top .allday')).not.toBeNull(); // Stays in place while the hours scroll.
      expect(text(scroller.querySelector('.grid__hours'))).toContain('12 AM');
    });

    it('shows proposals on the calendar, below the schedule, marked as proposed and needing approval', async () => {
      const { el } = await render({ sample: true });
      const blocks = [...el.querySelectorAll<HTMLElement>('.allday > li')];
      const proposal = blocks.find((li) => text(li).includes('Time with Mom'))!;

      expect(proposal.getAttribute('data-status')).toBe('proposed'); // Hatched, dashed outline.
      expect(text(proposal)).toContain('Proposed');
      expect(text(proposal)).toContain('Needs approval');
      expect(proposal.style.getPropertyValue('--lane')).toBe('2'); // Its own lane beneath the confirmed schedule.
      const confirmed = blocks.find((li) => text(li).includes('Time with Dad'))!;
      expect(confirmed.getAttribute('data-status')).toBe('confirmed');
      expect(text(confirmed)).not.toContain('Needs approval');
    });

    it('lists what needs this parent’s review first in Upcoming, linking to approvals', async () => {
      const { el } = await render({ sample: true });
      const first = el.querySelector('.upcoming__item')!;

      expect(text(first)).toContain('needs your review');
      expect(first.querySelector('a')!.getAttribute('href')).toBe('/approvals');
      expect([...el.querySelectorAll('.upcoming__title')].map(text)).toContain('Time with Dad');
    });

    it('filters children and retains selection across week and view changes', async () => {
      const { fixture, el } = await render({ sample: true });
      const calendar = () => el.querySelector('app-week-calendar')!;
      const pressed = () => [...el.querySelectorAll('.child-filter [aria-pressed="true"]')].map(text);
      expect(pressed()).toEqual(['Show all kids']);
      expect(text(calendar())).not.toMatch(/Show children separately|Group children with the same schedule/);
      button(el, 'Kai').click();
      await settle(fixture);
      expect(pressed()).toEqual(['Kai']);
      expect(text(calendar())).toContain('Soccer Practice');
      expect(text(calendar())).not.toContain('Piano Lesson');
      expect(text(calendar())).toContain('Dad unavailable');
      expect(calendar().querySelectorAll('.daycol .act[data-category="family"]')).toHaveLength(1);
      expect(text(calendar().querySelector('.allday .pt__meta'))).toContain('Kai ·');
      expect(text(calendar().querySelector('.allday .pt__meta'))).not.toContain('Aurora');
      button(el, 'Next week').click();
      await settle(fixture);
      button(el, 'List').click();
      await settle(fixture);
      expect(pressed()).toEqual(['Kai']);
      expect(text(calendar())).not.toContain('Piano Lesson');
      button(el, 'Aurora').click();
      await settle(fixture);
      expect(pressed()).toEqual(['Aurora']);
      expect(text(calendar())).toContain('Piano Lesson');
      expect(text(calendar())).not.toContain('Soccer Practice');
      expect(text(calendar())).toContain('School Play');
      button(el, 'Show all kids').click();
      await settle(fixture);
      expect(pressed()).toEqual(['Show all kids']);
      expect(text(calendar())).toContain('Soccer Practice');
      expect(text(calendar())).toContain('Piano Lesson');
      expect(TestBed.inject(HttpTestingController).match(() => true)).toEqual([]);
    });

    it('switches to the List view in place', async () => {
      const { fixture, el } = await render({ sample: true });

      button(el, 'List').click();
      await settle(fixture);

      expect(button(el, 'List').getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('.grid')).toBeNull();
      expect(el.querySelector('.agenda--always')).not.toBeNull();
    });

    it('steps through family memories', async () => {
      const { fixture, el } = await render({ sample: true });

      expect(text(el.querySelector('.memory__title'))).toBe('Sunset at the Lake');
      button(el, 'Next memory').click();
      await settle(fixture);
      expect(text(el.querySelector('.memory__title'))).toBe('Pumpkin Patch');
    });

    it('shows parent-to-parent messages and children’s shares', async () => {
      const { el } = await render({ sample: true });

      expect(text(el.querySelector('.messages'))).toContain('Can you pick Aurora up after art class?');
      expect([...el.querySelectorAll('.kids__what')].map(text)).toEqual([
        'Aurora shared a drawing with you',
        'Kai shared a photo with you',
      ]);
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { el } = await render({ sample: true });

      expect(await axeViolations(el)).toEqual([]);
    });
  });
});
