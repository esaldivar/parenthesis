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
import { repeatText, seriesDates } from './series';
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
    repeat: { days: ['Tuesday', 'Thursday'], until: '2026-11-05', count: null },
    ...over,
  });

describe('repeating events', () => {
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
      expect(seriesDates('2026-10-20', ['Tuesday', 'Thursday'], '2026-11-05', null)).toEqual([
        '2026-10-20',
        '2026-10-22',
        '2026-10-27',
        '2026-10-29',
        '2026-11-03',
        '2026-11-05',
      ]);
      expect(seriesDates('2026-10-20', ['Monday'], null, 2)).toEqual(['2026-10-26', '2026-11-02']);
      expect(seriesDates('2026-10-20', ['Tuesday'], null, 60)).toHaveLength(53);
      expect(repeatText({ days: ['Tuesday', 'Thursday'], until: '2026-11-05', count: null })).toBe('Every Tue and Thu until Nov 5, 2026');
      expect(repeatText({ days: ['Monday'], until: null, count: 4 })).toBe('Every Mon, 4 times');
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
    const repeatSwitch = () => page().querySelector<HTMLButtonElement>('.repeat button[role="switch"]')!;
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
      repeatSwitch().click();
      await settle();

      // It starts with the first date's weekday (Tuesday).
      expect(day('Tuesday').checked).toBe(true);
      day('Thursday').click();
      await settle();
      type('input[formcontrolname="repeatUntil"]', '2026-11-05');
      await settle();
      expect(text(page().querySelector('.preview'))).toBe('6 dates: Tue, Oct 20 · Thu, Oct 22 · Tue, Oct 27 · +3 more');
      page().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
      expect(create.request.body.repeat).toEqual({ days: ['Tuesday', 'Thursday'], until: '2026-11-05' });
      expect(create.request.body.category).toBe('Unavailable');
      create.flush(event({ category: 'Unavailable', title: 'Unavailable', seriesId: 's1' }));
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
    });

    it('offers Repeat only for activities and unavailable time', async () => {
      await openAdd();
      await choose('Activity');
      expect(page().querySelector('.repeat')).not.toBeNull();
      await choose('Parenting time');
      expect(page().querySelector('.repeat')).toBeNull();
      await choose('Family event');
      expect(page().querySelector('.repeat')).toBeNull();
    });

    it('checks the days and the end before sending', async () => {
      await openAdd();
      await choose('Activity');
      type('input[formcontrolname="title"]', 'Swim lessons');
      repeatSwitch().click();
      await settle();
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
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('has no axe violations with Repeat on', async () => {
      await openAdd();
      await choose('I’m unavailable');
      repeatSwitch().click();
      await settle();
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
    const field = (name: string) => page().querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`)!;
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
