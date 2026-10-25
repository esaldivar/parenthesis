import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent, ChangeRequest } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { toastText } from '../../../testing/toasts';

const F = '/api/families/family-1';
const FAMILY = {
  id: 'family-1',
  name: 'Rivera Family',
  timeZone: 'America/Chicago',
  createdAt: '2026-10-01T00:00:00Z',
  members: MEMBERS,
};

/** Sam proposed a long weekend with Kai; Alex (you) decides (synthetic). */
const PROPOSED = event({
  id: 'weekend',
  title: 'Long weekend with Sam',
  category: 'ParentingTime',
  status: 'PendingApproval',
  allDay: true,
  startsAt: '2026-10-21T05:00:00Z',
  endsAt: '2026-10-23T05:00:00Z',
  caregiverMembershipId: 'm-sam',
  ownerMembershipId: 'm-sam',
});

const request = (overrides: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: 'cr-1',
  type: 'CalendarCreate',
  targetType: 'CalendarEvent',
  targetId: 'weekend',
  summary: 'Parenting time: Long weekend with Sam',
  reason: null,
  status: 'Pending',
  proposerMembershipId: 'm-sam',
  createdAt: '2026-10-18T15:00:00Z',
  approvals: 1,
  requiredApprovals: 2,
  canDecide: true,
  proposedByYou: false,
  resolvedAt: null,
  decisions: [],
  ...overrides,
});

describe('approve or decline from an event’s details (#218)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let currentEvents: CalendarEvent[];

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(events: CalendarEvent[]) {
    currentEvents = events;
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        fakeAuth(),
      ],
    });
    harness = await RouterTestingHarness.create('/calendar?date=2026-10-20&view=list');
    http = TestBed.inject(HttpTestingController);
    const list = await vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/events`);
      expect(found.length).toBeGreaterThan(0);
      return found[found.length - 1];
    });
    for (const r of http.match(
      (r) => r.url === `${F}/calendar/reminders` || r.url === `${F}/calendar/tasks`,
    ))
      r.flush([]);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    list.flush(events);
    await settle();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;
  const dialog = () => document.querySelector('app-event-details [role="dialog"]') as HTMLElement;
  const buttons = () =>
    [...dialog().querySelectorAll<HTMLElement>('button, a')].map((b) => text(b));
  const button = (label: string) =>
    [...dialog().querySelectorAll<HTMLElement>('button')].find((b) => text(b) === label)!;

  async function openDetails(waiting: ChangeRequest[]) {
    (main().querySelector('app-calendar-list button.item') as HTMLElement).click();
    (await vi.waitFor(() => http.expectOne(`${F}/calendar/events/${currentEvents[0].id}`))).flush(currentEvents[0]);
    await settle();
    (
      await vi.waitFor(() =>
        http.expectOne((r) => r.url === `${F}/approvals` && !r.params.has('view')),
      )
    ).flush(waiting);
    await settle();
  }

  afterEach(() => localStorage.clear());

  it('offers Approve and Decline to the parent who can decide, and approving puts it on the calendar', async () => {
    await open([PROPOSED]);
    await openDetails([request()]);

    expect(text(dialog())).toContain('Waiting for your approval.');
    expect(buttons()).toContain('Approve');
    expect(buttons()).toContain('Decline…');
    expect(buttons()).not.toContain('Withdraw request…');

    button('Approve').click();
    const approve = await vi.waitFor(() =>
      http.expectOne((r) => r.method === 'POST' && r.url === `${F}/approvals/cr-1/approve`),
    );
    approve.flush(request({ status: 'Approved', canDecide: false }));
    await settle();

    expect(toastText()).toContain('You approved “Long weekend with Sam”. It’s on the calendar.');
    expect(document.querySelector('app-event-details')).toBeNull();
  });

  it('finds the one request for a repeating parenting time’s whole series, and approves every date with it (#239)', async () => {
    const weekly = event({
      ...PROPOSED,
      id: 'weekend-2',
      seriesId: 's-weekends',
      repeat: { frequency: 'Weekly', interval: 2, days: ['Wednesday'], until: null, count: 6 },
    });
    await open([weekly]);
    await openDetails([request({ targetType: 'calendar_series', targetId: 's-weekends' })]);

    expect(text(dialog())).toContain('Every 2 weeks on Wed, 6 times');
    expect(buttons()).toContain('Approve');
    button('Approve').click();
    const approve = await vi.waitFor(() =>
      http.expectOne((r) => r.method === 'POST' && r.url === `${F}/approvals/cr-1/approve`),
    );
    approve.flush(request({ status: 'Approved', canDecide: false }));
    await settle();
  });

  it('declines with an optional comment, as in the inbox', async () => {
    await open([PROPOSED]);
    await openDetails([request()]);

    button('Decline…').click();
    await settle();
    const comment = dialog().querySelector<HTMLTextAreaElement>('#event-decline-comment')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(comment));
    expect(text(dialog())).toContain('Tell Sam why (optional)');
    comment.value = 'That’s the school trip.';
    comment.dispatchEvent(new Event('input'));
    button('Decline').click();

    const reject = await vi.waitFor(() =>
      http.expectOne((r) => r.method === 'POST' && r.url === `${F}/approvals/cr-1/reject`),
    );
    expect(reject.request.body).toEqual({ comment: 'That’s the school trip.' });
    reject.flush(request({ status: 'Rejected', canDecide: false }));
    await settle();

    expect(toastText()).toContain(
      'You declined “Long weekend with Sam”. It isn’t on the schedule.',
    );
  });

  it('“Not now” keeps the request waiting and returns to the Decline button', async () => {
    await open([PROPOSED]);
    await openDetails([request()]);

    button('Decline…').click();
    await settle();
    button('Not now').click();
    await settle();

    expect(dialog().querySelector('#event-decline-comment')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('event-decline'));
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('says what an approved change or cancellation did', async () => {
    const changed = { ...PROPOSED, status: 'Confirmed' as const, pendingChange: 'Modify' as const };
    await open([changed]);
    await openDetails([request({ type: 'CalendarModify' })]);

    button('Approve').click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      request({ status: 'Approved' }),
    );
    await settle();

    expect(toastText()).toContain(
      'You approved the change. “Long weekend with Sam” was updated on the calendar.',
    );
  });

  it('shows calmly when the request was answered elsewhere, with no stale buttons', async () => {
    await open([PROPOSED]);
    await openDetails([]);

    expect(text(dialog())).toContain('This request isn’t waiting any more.');
    expect(buttons()).not.toContain('Approve');
    expect(buttons()).not.toContain('Decline…');
    expect(buttons()).not.toContain('Review in Approvals');
    expect(buttons()).toContain('Refresh the calendar');
  });

  it('when someone answers first, says so and stops offering the buttons', async () => {
    await open([PROPOSED]);
    await openDetails([request()]);

    button('Approve').click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      { title: 'This request was already decided.', status: 409 },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    (
      await vi.waitFor(() =>
        http.expectOne((r) => r.url === `${F}/approvals` && r.method === 'GET'),
      )
    ).flush([]);
    await settle();

    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
    expect(text(dialog())).toContain('This request isn’t waiting any more.');
    expect(buttons()).not.toContain('Approve');
  });

  it('shows the proposer only Withdraw', async () => {
    await open([{ ...PROPOSED, ownerMembershipId: 'm-alex', caregiverMembershipId: 'm-alex' }]);
    await openDetails([
      request({ canDecide: false, proposedByYou: true, proposerMembershipId: 'm-alex' }),
    ]);

    expect(buttons()).toContain('Withdraw request…');
    expect(buttons()).not.toContain('Approve');
    expect(buttons()).not.toContain('Decline…');
  });

  it('has no axe violations with the answer buttons and the decline comment open', async () => {
    await open([PROPOSED]);
    await openDetails([request()]);
    expect(await axeViolations(document.body)).toEqual([]);
    button('Decline…').click();
    await settle();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
