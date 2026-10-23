import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { RepeatRule, datesText, everyText, ordinal, repeatText, seriesDates } from './series';
import { toastText } from '../../../testing/toasts';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

/** Swim lessons, Tuesdays and Thursdays from October 20 until November 5, 2026 (synthetic). */
const swim = (over: Partial<CalendarEvent> = {}) =>
  event({
    id: 'swim-1',
    title: 'Swim lessons',
    location: 'North Pool',
    seriesId: 's1',
    repeat: {
      frequency: 'Weekly',
      interval: 1,
      days: ['Tuesday', 'Thursday'],
      until: '2026-11-05',
      count: null,
      dateCount: 6,
      firstStarts: ['2026-10-20T22:00:00Z', '2026-10-22T22:00:00Z', '2026-10-27T22:00:00Z'],
    },
    ...over,
  });

const weekly = (days: RepeatRule['days']): RepeatRule => ({ frequency: 'Weekly', interval: 1, days });

describe('repeating events', () => {
  // These tests use October 2026 dates; new dates can't be before today (#232), so "today" is October 1, 2026 here.
  beforeEach(() => vi.setSystemTime(new Date('2026-10-01T15:00:00Z')));
  afterEach(() => vi.useRealTimers());

  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  function configure() {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (label: string, within: Element) =>
    [...within.querySelectorAll<HTMLElement>('button, a')].find((b) => text(b) === label)!;

  describe('the dates', () => {
    it('match the server: chosen weekdays from the first date, up to a year, a count that doesn’t fit comes back short', () => {
      expect(seriesDates('2026-10-20', weekly(['Tuesday', 'Thursday']), '2026-11-05', null)).toEqual([
        '2026-10-20',
        '2026-10-22',
        '2026-10-27',
        '2026-10-29',
        '2026-11-03',
        '2026-11-05',
      ]);
      expect(seriesDates('2026-10-20', weekly(['Monday']), null, 2)).toEqual(['2026-10-26', '2026-11-02']);
      expect(seriesDates('2026-10-20', weekly(['Tuesday']), null, 60)).toHaveLength(53);
      expect(repeatText({ ...weekly(['Tuesday', 'Thursday']), until: '2026-11-05', count: null })).toBe('Every Tue and Thu until Nov 5, 2026');
      expect(repeatText({ ...weekly(['Monday']), until: null, count: 4 })).toBe('Every Mon, 4 times');
    });

    it('makes every-N-days, -weeks and -months dates as the server does, and says how (#238)', () => {
      const rule = (frequency: RepeatRule['frequency'], interval: number, days: RepeatRule['days'] = []): RepeatRule => ({ frequency, interval, days });
      expect(seriesDates('2026-10-28', rule('Daily', 2), null, 4)).toEqual(['2026-10-28', '2026-10-30', '2026-11-01', '2026-11-03']);
      // Every 2 weeks on Wed and Fri: this week, then the week after next.
      expect(seriesDates('2026-10-28', rule('Weekly', 2, ['Wednesday', 'Friday']), null, 4)).toEqual([
        '2026-10-28',
        '2026-10-30',
        '2026-11-11',
        '2026-11-13',
      ]);
      // Monthly on the 31st skips months without one.
      expect(seriesDates('2026-10-31', rule('Monthly', 1), '2027-03-31', null)).toEqual(['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31']);
      expect(seriesDates('2026-10-20', rule('Monthly', 3), null, 3)).toEqual(['2026-10-20', '2027-01-20', '2027-04-20']);

      // Every other weekend from a Friday keeps each weekend together: weeks count from the first date (#259).
      expect(seriesDates('2026-10-30', rule('Weekly', 2, ['Friday', 'Saturday', 'Sunday']), null, 6)).toEqual([
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
      ]);
      expect(everyText(rule('Weekly', 2, ['Friday', 'Saturday', 'Sunday']), '2026-10-30')).toBe('Every 2 weeks on Fri, Sat and Sun');
      expect(everyText(rule('Daily', 1), null)).toBe('Every day');
      expect(everyText(rule('Daily', 3), null)).toBe('Every 3 days');
      expect(everyText(rule('Weekly', 2, ['Tuesday', 'Thursday']), null)).toBe('Every 2 weeks on Tue and Thu');
      expect(everyText(rule('Monthly', 1), '2026-10-20')).toBe('Every month on the 20th');
      expect(repeatText({ ...rule('Monthly', 2), until: null, count: 4 }, '2026-10-01')).toBe('Every 2 months on the 1st, 4 times');
      expect(datesText(3, ['2026-10-28', '2026-11-04', '2026-11-11'])).toBe('3 dates: Oct 28, Nov 4, Nov 11');
      expect(datesText(12, ['2026-10-28', '2026-11-04', '2026-11-11'])).toBe('12 dates: Oct 28, Nov 4, Nov 11 and 9 more');
      expect(datesText(undefined, [])).toBeNull();
      expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
    });
  });

  describe('adding', () => {
    async function openAdd() {
      configure();
      harness = await RouterTestingHarness.create('/calendar/new?date=2026-10-20');
      http = TestBed.inject(HttpTestingController);
      await vi.waitFor(() => http.expectOne(F)).then((r) => r.flush(FAMILY));
      await vi.waitFor(() => http.expectOne(`${F}/children`)).then((r) => r.flush(CHILDREN));
      await settle();
    }

    const page = () => document.querySelector('app-add-event-page') as HTMLElement;
    const choose = async (label: string) => {
      [...page().querySelectorAll<HTMLButtonElement>('.type')].find((b) => text(b.querySelector('.type__label')) === label)!.click();
      await settle();
    };
    /** Chooses from the Repeat menu ("How often"). */
    const howOften = async (label: string) => {
      page().querySelector<HTMLElement>('mat-select[formcontrolname="repeat"] .mat-mdc-select-trigger')!.click();
      await settle();
      [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => text(o) === label)!.click();
      await settle();
    };
    /** Chooses from one of Custom's native lists by position. */
    const pickNative = async (name: string, index: number) => {
      const select = page().querySelector<HTMLSelectElement>(`select[formcontrolname="${name}"]`)!;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    const day = (name: string) => page().querySelector<HTMLInputElement>(`.weekday input[aria-label="${name}"]`)!;
    const type = (selector: string, value: string) => {
      const input = page().querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
    };

    it('repeats unavailable time on chosen days with a preview of the dates, and sends it once', async () => {
      await openAdd();
      await choose('I’m unavailable');
      await howOften('Custom…');

      // Custom starts every 1 week, on the first date's weekday (Tuesday).
      expect(day('Tuesday').checked).toBe(true);
      day('Thursday').click();
      await settle();
      type('input[formcontrolname="repeatUntil"]', '2026-11-05');
      await settle();
      expect(text(page().querySelector('.preview'))).toBe('6 dates: Tue, Oct 20 · Thu, Oct 22 · Tue, Oct 27 · +3 more');
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      expect(create.request.body.repeat).toEqual({ frequency: 'Weekly', interval: 1, days: ['Tuesday', 'Thursday'], until: '2026-11-05' });
      expect(create.request.body.category).toBe('Unavailable');
      create.flush(event({ category: 'Unavailable', title: 'Unavailable', seriesId: 's1' }));
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
    });

    it('makes each date one day while it repeats: the End date follows the start and can’t be changed (#259)', async () => {
      await openAdd();
      await choose('Activity');
      type('input[formcontrolname="title"]', 'Swim lessons');
      const end = () => page().querySelector<HTMLInputElement>('input[name="endDate"]')!;
      // The End date set to when the repeats should stop: this made every date run into the next.
      type('input[name="endDate"]', '2026-12-15');
      await settle();
      expect(end().disabled).toBe(false);

      // Custom by the week, on Monday, Saturday and Sunday, 6 times.
      await howOften('Custom…');
      expect(end().disabled).toBe(true);
      expect(end().value).toBe('10/20/2026');
      day('Tuesday').click();
      day('Monday').click();
      day('Saturday').click();
      day('Sunday').click();
      await settle();
      page().querySelector<HTMLElement>('mat-select[formcontrolname="ends"] .mat-mdc-select-trigger')!.click();
      await settle();
      [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => text(o) === 'After a number of times')!.click();
      await settle();
      type('input[formcontrolname="repeatCount"]', '6');
      await settle();
      expect(text(page().querySelector('.preview'))).toBe('6 dates: Sat, Oct 24 · Sun, Oct 25 · Mon, Oct 26 · +3 more');
      expect(text(page().querySelector('.repeat'))).toContain('Each date is one day, so the end date is the start date.');

      // A new start moves the End date with it.
      type('input[name="startDate"]', '2026-10-21');
      await settle();
      expect(end().value).toBe('10/21/2026');
      type('input[name="startDate"]', '2026-10-20');
      await settle();

      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      // Each date lasts the first date's own hour, never until the old End date.
      expect(create.request.body.startsAt).toBe('2026-10-20T14:00:00.000Z');
      expect(create.request.body.endsAt).toBe('2026-10-20T15:00:00.000Z');
      expect(create.request.body.repeat).toEqual({ frequency: 'Weekly', interval: 1, days: ['Sunday', 'Monday', 'Saturday'], count: 6 });
      create.flush(event({ title: 'Swim lessons', seriesId: 's1' }));
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
    });

    it('frees the End date again when it no longer repeats (#259)', async () => {
      await openAdd();
      await choose('I’m unavailable');
      await howOften('Every day');
      const end = () => page().querySelector<HTMLInputElement>('input[name="endDate"]')!;
      expect(end().disabled).toBe(true);
      await howOften('Does not repeat');
      expect(end().disabled).toBe(false);
      type('input[name="endDate"]', '2026-10-23');
      await settle();
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      // All day, October 20 to 23 in Chicago: the end is midnight after the 23rd.
      expect(create.request.body.endsAt).toBe('2026-10-24T05:00:00.000Z');
      expect(create.request.body.repeat).toBeUndefined();
      create.flush(event({ category: 'Unavailable', title: 'Unavailable' }));
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
    });

    it('offers Repeat for activities, unavailable time and parenting time, not family events (#239)', async () => {
      await openAdd();
      await choose('Activity');
      expect(page().querySelector('.repeat')).not.toBeNull();
      await choose('Parenting time');
      expect(page().querySelector('.repeat')).not.toBeNull();
      await choose('Family event');
      expect(page().querySelector('.repeat')).toBeNull();
    });

    it('sends repeating parenting time to the co-parent as one request for every date (#239)', async () => {
      await openAdd();
      await choose('Parenting time');
      [...page().querySelectorAll<HTMLLabelElement>('.kids label')].find((l) => text(l) === 'Kai')!.querySelector('input')!.click();
      await howOften('Every week on Tuesday');
      expect(text(page().querySelector('.repeat'))).toContain('approves or declines every date at once.');
      page().querySelector<HTMLElement>('mat-select[formcontrolname="ends"] .mat-mdc-select-trigger')!.click();
      await settle();
      [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => text(o) === 'After a number of times')!.click();
      await settle();
      type('input[formcontrolname="repeatCount"]', '4');
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      expect(create.request.body.category).toBe('ParentingTime');
      expect(create.request.body.repeat).toEqual({ frequency: 'Weekly', interval: 1, days: ['Tuesday'], count: 4 });
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0); // One request, not one per date.
      create.flush(event({ category: 'ParentingTime', title: 'Time with Alex', status: 'PendingApproval', seriesId: 's1' }));
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
    });

    it('checks the days and the end before sending', async () => {
      await openAdd();
      await choose('Activity');
      type('input[formcontrolname="title"]', 'Swim lessons');
      await howOften('Custom…');
      day('Tuesday').click(); // Now no days.
      await settle();
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(text(page())).toContain('Choose the days it repeats on.');

      day('Tuesday').click();
      type('input[formcontrolname="repeatUntil"]', '2027-10-21');
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(text(page())).toContain('Choose an end date from the first day to a year later.');

      // A typed end date that isn't one says how to write it, rather than being treated as missing.
      type('input[formcontrolname="repeatUntil"]', 'next fall');
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(text(page())).toContain('Enter a date like 10/27/2026.');
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('offers every day, week and month, named for the start, and Custom; no yearly (#238)', async () => {
      await openAdd();
      await choose('Activity');
      page().querySelector<HTMLElement>('mat-select[formcontrolname="repeat"] .mat-mdc-select-trigger')!.click();
      await settle();
      expect([...document.querySelectorAll('mat-option')].map(text)).toEqual([
        'Does not repeat',
        'Every day',
        'Every week on Tuesday',
        'Every month on the 20th',
        'Custom…',
      ]);
      [...document.querySelectorAll<HTMLElement>('mat-option')][3].click();
      await settle();
      type('input[formcontrolname="title"]', 'Library day');
      type('input[formcontrolname="repeatUntil"]', '2027-01-20');
      await settle();
      expect(text(page().querySelector('.preview'))).toBe('4 dates: Tue, Oct 20 · Fri, Nov 20 · Sun, Dec 20 · +1 more');
      // Only Custom by the week shows the weekdays.
      expect(page().querySelector('.weekdays')).toBeNull();
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      expect(create.request.body.repeat).toEqual({ frequency: 'Monthly', interval: 1, days: [], until: '2027-01-20' });
    });

    it('repeats every few days, weeks or months with Custom’s two lists (#238)', async () => {
      await openAdd();
      await choose('I’m unavailable');
      await howOften('Custom…');
      await pickNative('every', 2); // 3
      await pickNative('unit', 0); // days
      expect(page().querySelector('.weekdays')).toBeNull();
      expect([...page().querySelectorAll('select[formcontrolname="unit"] option')].map(text)).toEqual(['days', 'weeks', 'months']);
      page().querySelector<HTMLElement>('mat-select[formcontrolname="ends"] .mat-mdc-select-trigger')!.click();
      await settle();
      [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => text(o) === 'After a number of times')!.click();
      await settle();
      type('input[formcontrolname="repeatCount"]', '3');
      await settle();
      expect(text(page().querySelector('.preview'))).toBe('3 dates: Tue, Oct 20 · Fri, Oct 23 · Mon, Oct 26');

      // Every 1 to 99 days, weeks or months (#238): switching the unit keeps the number.
      await pickNative('every', 19); // 20
      await pickNative('unit', 2); // months
      expect(Number(page().querySelector<HTMLSelectElement>('select[formcontrolname="every"]')!.selectedIndex) + 1).toBe(20);
      expect(page().querySelectorAll('select[formcontrolname="every"] option')).toHaveLength(99);
    });

    it('has no axe violations with Repeat on', async () => {
      await openAdd();
      await choose('I’m unavailable');
      await howOften('Custom…');
      expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
    });
  });

  describe('details and cancelling', () => {
    async function openCalendar(events: CalendarEvent[]) {
      configure();
      harness = await RouterTestingHarness.create('/calendar?date=2026-10-20&view=list');
      http = TestBed.inject(HttpTestingController);
      const request = await vi.waitFor(() => {
        const found = http.match((r) => r.url === `${F}/calendar/events`);
        expect(found.length).toBeGreaterThan(0);
        return found[found.length - 1];
      });
      for (const r of http.match((r) => r.url === `${F}/calendar/reminders` || r.url === `${F}/calendar/tasks`)) r.flush([]);
      for (const r of http.match(F)) r.flush(FAMILY);
      for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
      request.flush(events);
      await settle();
    }

    it('says how it repeats and asks which dates to cancel', async () => {
      await openCalendar([swim()]);
      (document.querySelector('app-calendar-list button.item') as HTMLElement).click();
      await settle();
      const dialog = document.querySelector('app-event-details [role="dialog"]')!;

      expect(text(dialog)).toContain('RepeatsEvery Tue and Thu until Nov 5, 2026');
      // The series' date count and first dates (#239).
      expect(text(dialog)).toContain('Dates6 dates: Oct 20, Oct 22, Oct 27 and 3 more');
      button('Cancel event…', dialog).click();
      await settle();
      expect(text(dialog)).toContain('This repeats. Which dates do you want to cancel?');
      button('This and following', dialog).click();

      const cancel = await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url === `${F}/calendar/events/swim-1`));
      expect(cancel.request.params.get('scope')).toBe('following');
      cancel.flush(null);
      await settle();
      expect(toastText()).toContain('“Swim lessons” was cancelled from Tuesday, October 20 on.');
    });

    it('cancels repeating parenting time one date at a time, through approval (#239)', async () => {
      await openCalendar([
        swim({ id: 'pt-1', category: 'ParentingTime', title: 'Time with Alex', caregiverMembershipId: 'm-alex', location: null }),
      ]);
      (document.querySelector('app-calendar-list button.item') as HTMLElement).click();
      await settle();
      const dialog = document.querySelector('app-event-details [role="dialog"]')!;
      expect(text(dialog)).toContain('Every Tue and Thu until Nov 5, 2026');
      button('Cancel event…', dialog).click();
      await settle();
      expect(text(dialog)).not.toContain('This and following');
      expect(text(dialog)).not.toContain('All events');
    });

    it('keeps the single-event cancel for events that don’t repeat', async () => {
      await openCalendar([event()]);
      (document.querySelector('app-calendar-list button.item') as HTMLElement).click();
      await settle();
      const dialog = document.querySelector('app-event-details [role="dialog"]')!;
      button('Cancel event…', dialog).click();
      await settle();
      expect(button('Yes, cancel event', dialog)).toBeTruthy();
      expect(text(dialog)).not.toContain('This and following');
    });
  });

  describe('editing', () => {
    async function openEdit(current: CalendarEvent) {
      configure();
      harness = await RouterTestingHarness.create(`/calendar/${current.id}/edit`);
      http = TestBed.inject(HttpTestingController);
      (await vi.waitFor(() => http.expectOne(`${F}/calendar/events/${current.id}`))).flush(current);
      for (const r of await vi.waitFor(() => {
        const found = http.match(F);
        expect(found.length).toBeGreaterThan(0);
        return found;
      })) {
        r.flush(FAMILY);
      }
      await settle();
    }

    const page = () => document.querySelector('app-event-edit-page') as HTMLElement;
    const field = (name: string) => page().querySelector<HTMLInputElement>(`[formcontrolname="${name}"], input[name="${name}"]`)!;
    const scope = (label: string) =>
      [...page().querySelectorAll('.scope__option')].find((l) => text(l) === label)!.querySelector('input') as HTMLInputElement;

    it('asks which dates to change, keeps each date’s day, and sends only what changed', async () => {
      await openEdit(swim());
      expect(text(page().querySelector('.scope legend'))).toBe(
        'This repeats: Every Tue and Thu until Nov 5, 2026. Change which dates?',
      );
      expect(scope('This event').checked).toBe(true);

      scope('All events').click();
      await settle();
      expect(field('startDate').disabled).toBe(true);
      expect(text(page())).toContain('Each date keeps its own day.');
      field('location').value = 'South Pool';
      field('location').dispatchEvent(new Event('input'));
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH' && r.url === `${F}/calendar/events/swim-1`));
      expect(patch.request.params.get('scope')).toBe('all');
      expect(patch.request.body).toEqual({ location: 'South Pool' });
    });

    it('sends new times for this and following, as a time of day', async () => {
      await openEdit(swim());
      scope('This and following').click();
      await settle();
      field('startTime').value = '16:00';
      field('startTime').dispatchEvent(new Event('input'));
      field('endTime').value = '17:00';
      field('endTime').dispatchEvent(new Event('input'));
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH'));
      expect(patch.request.params.get('scope')).toBe('following');
      expect(patch.request.body).toEqual({ allDay: false, startsAt: '2026-10-20T21:00:00.000Z', endsAt: '2026-10-20T22:00:00.000Z' });
    });

    it('has no axe violations with the scope choice', async () => {
      await openEdit(swim());
      expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
    });
  });
});
