import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent, Reminder } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event, reminder } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { toastText } from '../../../testing/toasts';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

describe('the calendar page', () => {
  let http: HttpTestingController;

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  /** The latest events request. The reminders and tasks requests made with it are answered (tasks: none). */
  const eventsRequest = (reminders: Reminder[] = []) =>
    vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/events`);
      expect(found.length).toBeGreaterThan(0);
      for (const r of http.match((r) => r.url === `${F}/calendar/reminders`)) {
        r.flush(reminders);
      }
      for (const r of http.match((r) => r.url === `${F}/calendar/tasks`)) {
        r.flush([]);
      }
      return found[found.length - 1];
    });

  async function open(url: string, events: CalendarEvent[] | 'error' = [], reminders: Reminder[] = []) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    const harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    const request = await eventsRequest(reminders);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    if (events === 'error') {
      request.flush({ title: 'Server error' }, { status: 500, statusText: 'Server error' });
    } else {
      request.flush(events);
    }
    await settle(harness);
    return { harness, body: document.body, request };
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;

  function click(label: string, within: Element = main()) {
    const match = [...within.querySelectorAll<HTMLElement>('button, a')].find((b) => text(b) === label);
    if (!match) {
      throw new Error(`No button "${label}"`);
    }
    match.click();
  }

  it('opens on the week the dashboard was showing and asks only for that week, in the family’s time zone', async () => {
    const { request } = await open('/calendar?week=2026-10-21', [event()]);

    expect(text(main().querySelector('.period__label'))).toBe('October 18 – 24, 2026');
    expect(request.request.params.get('from')).toBe('2026-10-18T05:00:00.000Z');
    expect(request.request.params.get('to')).toBe('2026-10-25T05:00:00.000Z');
    expect(main().querySelector('.segmented [aria-pressed="true"]')!.textContent!.trim()).toBe('Week');
  });

  it('labels pending items in words, never as confirmed', async () => {
    await open('/calendar?date=2026-10-20', [
      event({ id: 'p', title: 'Time with Sam', category: 'ParentingTime', status: 'PendingApproval', caregiverMembershipId: 'm-sam' }),
    ]);

    const item = main().querySelector('app-calendar-week button.item')!;
    expect(item.getAttribute('data-status')).toBe('pending');
    expect(text(item)).toContain('Pending approval');
    expect(text(item)).not.toContain('Confirmed');
  });

  for (const view of ['week', 'month'] as const) {
    it(`opens the clicked event’s details from the ${view} view and returns focus to it (#213)`, async () => {
      const { harness } = await open(`/calendar?date=2026-10-20&view=${view}`, [
        event({ id: 'swim', title: 'Swim lesson' }),
        event({ id: 'piano', title: 'Piano lesson', startsAt: '2026-10-21T21:00:00Z', endsAt: '2026-10-21T22:00:00Z' }),
      ]);

      // Week: its day list, which narrow screens (and this test's page) show; the grid's buttons do the same.
      const where = view === 'week' ? 'app-calendar-week .agenda' : 'app-calendar-month';
      const piano = [...main().querySelectorAll<HTMLElement>(`${where} button.item`)].find((b) => text(b).includes('Piano lesson'))!;
      piano.focus();
      piano.click();
      await settle(harness);

      const dialog = document.querySelector('app-event-details [role="dialog"]')!;
      expect(text(dialog.querySelector('h2'))).toBe('Piano lesson');
      // Opening details changes nothing.
      expect(http.match((r) => r.method !== 'GET')).toHaveLength(0);

      (dialog.querySelector('button[aria-label="Close details"]') as HTMLElement).click();
      await settle(harness);
      await vi.waitFor(() => expect(document.activeElement).toBe(piano));
    });
  }

  describe('adding from a tap on empty space (#212)', () => {
    /** A click at `y` px down a day column 480px tall (10px per half-hour), as a pointer makes it. */
    function tapAt(target: HTMLElement, y: number) {
      target.getBoundingClientRect = () => ({ top: 100, height: 480, left: 0, width: 100 }) as DOMRect;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 100 + y, detail: 1 }));
    }
    const column = (label: string) =>
      [...main().querySelectorAll<HTMLButtonElement>('app-calendar-week .slot-add__button')].find((b) => text(b) === `Add on ${label}`)!;

    const pick = () => main().querySelector<HTMLButtonElement>('app-calendar-week .slot-pick__button');

    it('highlights the hour tapped in the week’s time grid, then opens Add there from the highlight, saving nothing (#237)', async () => {
      const { harness } = await open('/calendar?date=2026-10-20', [event()]);
      tapAt(column('Wednesday, October 21'), 345); // 5:00 PM.
      await settle(harness);

      expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20');
      expect(pick()!.getAttribute('aria-label')).toBe('Add on Wednesday, October 21 at 5:00 PM');
      expect(text(pick())).toBe('5:00 PM');
      expect(pick()!.closest('li')!.style.gridRow).toBe('35 / span 2');

      pick()!.click();
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/calendar/new?date=2026-10-21&time=17:00');
      expect(http.match((r) => r.method !== 'GET')).toHaveLength(0);
    });

    it('moves the highlight to another tap, adds on a second tap in the same place, and clears on Escape (#237)', async () => {
      const { harness } = await open('/calendar?date=2026-10-20', [event()]);
      tapAt(column('Wednesday, October 21'), 345); // 5:00 PM.
      await settle(harness);
      tapAt(column('Thursday, October 22'), 205); // 10:00 AM.
      await settle(harness);
      expect(main().querySelectorAll('.slot-pick')).toHaveLength(1);
      expect(pick()!.getAttribute('aria-label')).toBe('Add on Thursday, October 22 at 10:00 AM');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle(harness);
      expect(pick()).toBeNull();

      tapAt(column('Thursday, October 22'), 205);
      await settle(harness);
      tapAt(column('Thursday, October 22'), 205);
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/calendar/new?date=2026-10-22&time=10:00');
    });

    it('from the keyboard, each day column is a labelled button that adds on that day', async () => {
      const { harness } = await open('/calendar?date=2026-10-20', [event()]);
      const wednesday = column('Wednesday, October 21');
      expect(wednesday.tagName).toBe('BUTTON');
      wednesday.click(); // A keyboard press: no pointer position.
      await settle(harness);

      expect(TestBed.inject(Router).url).toBe('/calendar/new?date=2026-10-21');
    });

    it('never adds when an event is tapped: it opens its details instead', async () => {
      const { harness } = await open('/calendar?date=2026-10-20', [event({ id: 'swim', title: 'Swim lesson' })]);
      (main().querySelector('app-calendar-week .daycol button.item') as HTMLElement).click();
      await settle(harness);

      expect(TestBed.inject(Router).url).not.toContain('/calendar/new');
      expect(document.querySelector('app-event-details')).not.toBeNull();
    });

    it('adds on the day tapped in the all-day row', async () => {
      const { harness } = await open('/calendar?date=2026-10-20', [event()]);
      // The row's pointer-only layer, under its events (keyboards use the day columns' buttons).
      const row = main().querySelector<HTMLElement>('app-calendar-week .allday .tap-add__button')!;
      expect(row.tabIndex).toBe(-1);
      row.getBoundingClientRect = () => ({ top: 0, height: 40, left: 0, width: 700 }) as DOMRect;
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 650 })); // Saturday.
      await settle(harness);
      expect(pick()!.getAttribute('aria-label')).toBe('Add on Saturday, October 24');
      pick()!.click();
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/calendar/new?date=2026-10-24');
    });

    it('adds on a Month day’s empty space; its number still opens the week', async () => {
      const { harness } = await open('/calendar?date=2026-10-20&view=month', [event()]);
      const day = [...main().querySelectorAll<HTMLElement>('app-calendar-month .day')].find(
        (d) => d.querySelector('.day__number')?.getAttribute('aria-label')?.includes('October 22'),
      )!;
      day.querySelector<HTMLElement>('.day__add')!.click();
      await settle(harness);
      expect(day.classList).toContain('is-picked');
      const add = day.querySelector<HTMLButtonElement>('.slot-pick__button')!;
      expect(add.getAttribute('aria-label')).toBe('Add on Thursday, October 22');
      add.click();
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/calendar/new?date=2026-10-22');
    });
  });

  it('shows a calm loading state, then an error with Try again that reloads', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', 'error');

    expect(text(main().querySelector('[role="alert"]'))).toContain('We couldn’t load your calendar.');
    click('Try again');
    await settle(harness);
    expect(main().querySelector('.body')!.getAttribute('aria-busy')).toBe('true');
    const retry = await eventsRequest();
    // The first load failed, so the family and children are fetched again with it.
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    retry.flush([event()]);
    await settle(harness);
    expect(main().querySelector('app-calendar-week')).not.toBeNull();
  });

  it('says honestly that there’s nothing yet, with a way to add', async () => {
    await open('/calendar?date=2026-10-20', []);

    expect(text(main())).toContain('No events yet');
    const add = [...main().querySelectorAll('a')].find((a) => text(a) === 'Add to Calendar')!;
    expect(add.getAttribute('href')).toBe('/calendar/new?date=2026-10-20');
  });

  it('filters by child and keeps the choice in the address', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [
      event({ id: 'kai', title: 'Kai’s practice' }),
      event({ id: 'aurora', title: 'Aurora’s recital', childIds: ['aurora'] }),
    ]);

    click('Aurora', main().querySelector('.filters')!);
    await settle(harness);
    const request = await eventsRequest().catch(() => null);
    request?.flush([event({ id: 'kai', title: 'Kai’s practice' }), event({ id: 'aurora', title: 'Aurora’s recital', childIds: ['aurora'] })]);
    await settle(harness);

    expect(TestBed.inject(Router).url).toContain('child=aurora');
    const titles = [...main().querySelectorAll('app-calendar-week .agenda .title')].map((t) => text(t));
    expect(titles).toEqual(['Aurora’s recital']);
  });

  it('switches to Month and List and fetches their ranges', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [event()]);

    click('Month', main().querySelector('.segmented')!);
    await settle(harness);
    const month = await eventsRequest();
    expect(month.request.params.get('from')).toBe('2026-09-27T05:00:00.000Z');
    expect(month.request.params.get('to')).toBe('2026-11-08T06:00:00.000Z');
    month.flush([event()]);
    await settle(harness);
    expect(text(main().querySelector('.period__label'))).toBe('October 2026');
    expect(main().querySelector('app-calendar-month')).not.toBeNull();

    click('List', main().querySelector('.segmented')!);
    await settle(harness);
    const list = await eventsRequest();
    expect(list.request.params.get('from')).toBe('2026-10-01T05:00:00.000Z');
    list.flush([event()]);
    await settle(harness);
    expect(text(main().querySelector('app-calendar-list'))).toContain('Tuesday, October 20');
  });

  it('opens details, and cancelling parenting time asks the co-parent first', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [
      event({ id: 'pt', title: 'Time with Alex', category: 'ParentingTime', caregiverMembershipId: 'm-alex', allDay: true, startsAt: '2026-10-20T05:00:00Z', endsAt: '2026-10-21T05:00:00Z' }),
    ]);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(text(dialog.querySelector('h2'))).toBe('Time with Alex');
    expect(text(dialog)).toContain('Confirmed');

    click('Cancel event…', dialog);
    await settle(harness);
    expect(text(dialog)).toContain('This asks Sam to approve cancelling it.');
    click('Yes, cancel event', dialog);
    const cancel = await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url === `${F}/calendar/events/pt`));
    cancel.flush(event({ id: 'pt', category: 'ParentingTime', pendingChange: 'Cancel' }));
    const reload = await eventsRequest();
    reload.flush([]);
    await settle(harness);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(toastText()).toContain('Cancellation sent to Sam for approval.');
  });

  it('offers Edit and Request swap on confirmed parenting time', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [
      event({ id: 'pt', title: 'Time with Alex', category: 'ParentingTime', caregiverMembershipId: 'm-alex' }),
    ]);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    const swap = [...document.querySelectorAll('[role="dialog"] a')].find((a) => text(a) === 'Request swap')!;

    expect(swap.getAttribute('href')).toBe('/calendar/pt/swap');
    const edit = [...document.querySelectorAll('[role="dialog"] a')].find((a) => text(a) === 'Edit event')!;
    expect(edit.getAttribute('href')).toBe('/calendar/pt/edit');
  });

  it('opens a waiting swap from a link, with its reason and status, and lets its sender withdraw it', async () => {
    const pending = event({
      id: 'pt',
      title: 'Time with Alex',
      category: 'ParentingTime',
      caregiverMembershipId: 'm-alex',
      pendingChange: 'Modify',
      proposed: {
        title: 'Time with Alex',
        startsAt: '2026-10-24T13:00:00Z',
        endsAt: '2026-10-24T20:00:00Z',
        allDay: false,
        location: null,
        caregiverMembershipId: 'm-alex',
      },
    });
    const { harness } = await open('/calendar?date=2026-10-20&event=pt', [pending]);
    const approvals = await vi.waitFor(() => http.expectOne(`${F}/approvals`));
    approvals.flush([
      {
        id: 'r1',
        type: 'CalendarModify',
        targetType: 'calendar_event',
        targetId: 'pt',
        summary: 'Change Time with Alex',
        reason: 'I have a work trip that weekend.',
        status: 'Pending',
        proposerMembershipId: 'm-alex',
        createdAt: '2026-10-20T19:14:00Z',
        approvals: 1,
        requiredApprovals: 2,
        canDecide: false,
        proposedByYou: true,
        resolvedAt: null,
        decisions: [],
      },
    ]);
    await settle(harness);

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(text(dialog)).toContain('Change pending');
    expect(text(dialog)).toContain('ProposedSaturday, October 24 · 8:00 AM – 3:00 PMReasonI have a work trip that weekend.');
    expect(text(dialog)).toContain('Request sent Tue, Oct 20, 2:14 PM');
    expect(text(dialog)).toContain('Sam’s answer Waiting');
    expect(text(dialog)).toContain('Calendar updated Happens automatically once approved');

    click('Withdraw request…', dialog);
    await settle(harness);
    click('Yes, withdraw', dialog);
    const withdraw = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/approvals/r1/withdraw`));
    withdraw.flush(null);
    (await eventsRequest()).flush([event({ id: 'pt', title: 'Time with Alex', category: 'ParentingTime' })]);
    await settle(harness);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(toastText()).toContain('You withdrew your request. “Time with Alex” stays as it was.');
  });

  it('keeps the other parent’s unavailable notes private and offers them no cancel', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [
      event({ id: 'u', title: 'Unavailable', category: 'Unavailable', childIds: [], ownerMembershipId: 'm-sam' }),
    ]);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    const dialog = document.querySelector('[role="dialog"]')!;

    expect(text(dialog)).toContain('Private details aren’t shared.');
    expect([...dialog.querySelectorAll('button')].some((b) => text(b) === 'Cancel event…')).toBe(false);
    expect([...dialog.querySelectorAll('a')].some((a) => text(a) === 'Edit event')).toBe(false);
  });

  it('shows reminders with their own label, filtered by child, and in Month and List too', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [], [
      reminder(),
      reminder({ id: 'r2', title: 'Pack lunches', childId: null, allDay: true, startsAt: '2026-10-21T05:00:00Z' }),
    ]);

    const agenda = () => [...main().querySelectorAll('app-calendar-week .agenda .title')].map((t) => text(t));
    expect(agenda()).toEqual(['Spirit Day', 'Pack lunches']);
    const item = main().querySelector('app-calendar-week .agenda button.item')!;
    expect(item.getAttribute('data-kind')).toBe('reminder');
    expect(text(item)).toContain('Spirit Day, Reminder, 8:00 AM');
    expect(text(main().querySelector('.key'))).toContain('Reminder');

    click('Aurora', main().querySelector('.filters')!);
    await settle(harness);
    (await eventsRequest().catch(() => null))?.flush([]);
    await settle(harness);
    expect(agenda()).toEqual(['Pack lunches']); // A reminder about no child stays for everyone.

    click('List', main().querySelector('.segmented')!);
    await settle(harness);
    (await eventsRequest([reminder()])).flush([]);
    await settle(harness);
    click('All', main().querySelector('.filters')!);
    await settle(harness);
    (await eventsRequest([reminder()]).catch(() => null))?.flush([]);
    await settle(harness);
    expect(text(main().querySelector('app-calendar-list'))).toContain('Spirit Day');
  });

  it('marks a reminder seen only when its details are opened, and shows who changed it', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [], [
      reminder({ repeat: 'Weekly', repeatCount: 3, editedBy: 'm-sam', seenBy: [{ membershipId: 'm-sam', seenAt: '2026-10-19T00:00:00Z' }] }),
    ]);
    expect(http.match((r) => r.url.endsWith('/seen'))).toHaveLength(0);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    const dialog = document.querySelector('[role="dialog"]')!;
    const seen = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/reminders/r1/seen`));
    seen.flush(null);

    expect(text(dialog.querySelector('h2'))).toBe('Spirit Day');
    expect(text(dialog)).toContain('Reminder');
    expect(text(dialog)).toContain('Tuesday, October 20 · 8:00 AM');
    expect(text(dialog)).toContain('RepeatsEvery week, 3 times');
    expect(text(dialog)).toContain('AboutKai');
    expect(text(dialog)).toContain('DetailsWear a blue shirt');
    expect(text(dialog)).toContain('Added by Sam Edited by Sam Seen by Sam');
    expect([...dialog.querySelectorAll('a')].find((a) => text(a) === 'Edit reminder')!.getAttribute('href')).toBe('/calendar/reminders/r1/edit');
    // No location, completion, assignee or attachment controls on a reminder.
    expect(text(dialog)).not.toMatch(/Where|Mark done|Assign|Attach/);
  });

  it('deletes a reminder for both parents after confirming, with no approval', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [], [reminder({ repeat: 'Daily', repeatCount: 2 })]);
    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    const dialog = document.querySelector('[role="dialog"]')!;
    http.match((r) => r.url.endsWith('/seen')).forEach((r) => r.flush(null));

    click('Delete reminder…', dialog);
    await settle(harness);
    expect(text(dialog)).toContain('This deletes the reminder and every repeat of it, for both of you.');
    click('Yes, delete', dialog);
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url === `${F}/calendar/reminders/r1`))).flush(null);
    (await eventsRequest()).flush([]);
    await settle(harness);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(toastText()).toContain('“Spirit Day” was deleted.');
    expect(http.match((r) => r.url.includes('/approvals'))).toHaveLength(0);
  });

  it('has no axe violations with a reminder and its details open', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [], [reminder()]);
    expect(await axeViolations(document.body)).toEqual([]);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    http.match((r) => r.url.endsWith('/seen')).forEach((r) => r.flush(null));
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('has no axe violations with events and with details open', async () => {
    const { harness } = await open('/calendar?date=2026-10-20', [
      event(),
      event({ id: 'f', title: 'School play', category: 'Joint', status: 'PendingApproval', childIds: [] }),
    ]);
    expect(await axeViolations(document.body)).toEqual([]);

    (main().querySelector('app-calendar-week .agenda button.item') as HTMLElement).click();
    await settle(harness);
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

