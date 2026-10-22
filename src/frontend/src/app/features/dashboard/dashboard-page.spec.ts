import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { LiveDashboardDataSource } from './dashboard-data';
import { DashboardWeek } from './model';
import { DashboardPage, NOW } from './dashboard-page';
import { MIN_SLOTS } from './timeline';

// Wednesday, October 14, 2026, 9:00 AM in the fake family's time zone (America/Chicago).
const WEDNESDAY_MORNING = new Date('2026-10-14T14:00:00Z');

describe('DashboardPage (approved design)', () => {
  /** A live week with nothing in it: what a new family sees. */
  const EMPTY_WEEK: DashboardWeek = {
    source: 'live',
    parentingTime: [],
    events: [],
    pendingReviews: [],
    kidShares: [],
    recentMessages: [],
    recentMemories: [],
    notes: [],
  };

  async function render(options: { sample?: boolean; failingSource?: boolean; week?: string; live?: DashboardWeek } = {}) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fakeAuth(), { provide: NOW, useValue: () => WEDNESDAY_MORNING }],
    });
    let calls = 0;
    TestBed.overrideProvider(LiveDashboardDataSource, {
      useValue: {
        load: () => (++calls, options.failingSource ? Promise.reject(new Error('offline')) : Promise.resolve(options.live ?? EMPTY_WEEK)),
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

    it('has no automatically detectable accessibility issues', async () => {
      const { el } = await render();

      expect(await axeViolations(el)).toEqual([]);
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

    it('splits children for this week only, as a reversible view preference', async () => {
      const { fixture, el } = await render({ sample: true });
      const toggle = () => button(el, /children separately|same schedule/);

      toggle().click();
      await settle(fixture);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelectorAll('.allday > li[data-status="confirmed"]')).toHaveLength(2);

      button(el, 'Next week').click();
      await settle(fixture);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
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
