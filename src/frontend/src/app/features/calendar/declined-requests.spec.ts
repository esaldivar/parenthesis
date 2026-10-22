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

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

/** Alex proposed a long weekend with Kai; Sam declined it (synthetic). */
const DECLINED = event({
  id: 'weekend',
  title: 'Long weekend with Alex',
  category: 'ParentingTime',
  status: 'Rejected',
  allDay: true,
  startsAt: '2026-10-21T05:00:00Z',
  endsAt: '2026-10-23T05:00:00Z',
  caregiverMembershipId: 'm-alex',
  ownerMembershipId: 'm-alex',
});

const DECISION: ChangeRequest = {
  id: 'cr-1',
  type: 'CalendarCreate',
  targetType: 'CalendarEvent',
  targetId: 'weekend',
  summary: 'Parenting time: Long weekend with Alex',
  reason: null,
  status: 'Rejected',
  proposerMembershipId: 'm-alex',
  createdAt: '2026-10-18T15:00:00Z',
  approvals: 1,
  requiredApprovals: 2,
  canDecide: false,
  proposedByYou: true,
  resolvedAt: '2026-10-19T14:30:00Z',
  decisions: [{ deciderMembershipId: 'm-sam', decision: 'Reject', comment: 'That’s the school trip weekend.', decidedAt: '2026-10-19T14:30:00Z' }],
};

describe('declined requests on the calendar', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(events: CalendarEvent[], view = 'list') {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(`/calendar?date=2026-10-20&view=${view}`);
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

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;
  const dialog = () => document.querySelector('app-event-details [role="dialog"]') as HTMLElement;
  const buttons = (within: Element) => [...within.querySelectorAll<HTMLElement>('button, a')].map((b) => text(b));

  async function openDetails() {
    (main().querySelector('app-calendar-list button.item[data-status="declined"]') as HTMLElement).click();
    await settle();
    const history = await vi.waitFor(() => http.expectOne((r) => r.url === `${F}/approvals` && r.params.get('view') === 'history'));
    history.flush([DECISION]);
    await settle();
  }

  afterEach(() => localStorage.clear());

  it('labels a declined request as declined, in words, apart from confirmed and pending items', async () => {
    await open([DECLINED, event()]);

    const declined = main().querySelector('app-calendar-list button.item[data-status="declined"]')!;
    expect(text(declined)).toContain('Declined');
    expect(declined.querySelector('.title--declined')).not.toBeNull();
    expect(main().querySelectorAll('app-calendar-list button.item[data-status="confirmed"]')).toHaveLength(1);
  });

  it('says who declined it, when and why, and offers only removing it from this parent’s calendar', async () => {
    await open([DECLINED]);
    await openDetails();

    expect(text(dialog())).toContain('Sam declined this request on Mon, Oct 19, 9:30 AM. It isn’t on the schedule.');
    expect(text(dialog())).toContain('CommentThat’s the school trip weekend.');
    expect(buttons(dialog())).not.toContain('Edit event');
    expect(buttons(dialog())).not.toContain('Cancel event…');
    expect(buttons(dialog())).not.toContain('Request swap');
    expect(buttons(dialog())).not.toContain('Withdraw request…');

    [...dialog().querySelectorAll('button')].find((b) => text(b) === 'Remove from my calendar')!.click();
    const dismiss = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events/weekend/dismiss`));
    dismiss.flush(null);
    await settle();
    expect(text(main())).toContain('“Long weekend with Alex” was removed from your calendar. It’s still in the approvals history.');
  });

  it('can be hidden with the Declined approval filter', async () => {
    localStorage.setItem(
      'parenthesis.calendar-filters.user-1.family-1',
      JSON.stringify({ approval: ['confirmed', 'pending', 'change-pending'], options: ['confirmed', 'pending', 'change-pending', 'declined'] }),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
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
    request.flush([DECLINED, event()]);
    await settle();

    expect(main().querySelectorAll('app-calendar-list button.item[data-status="declined"]')).toHaveLength(0);
    expect(main().querySelectorAll('app-calendar-list button.item[data-status="confirmed"]')).toHaveLength(1);
  });

  it('has no axe violations in the week grid and with its details open', async () => {
    await open([DECLINED, event()], 'week');
    expect(await axeViolations(document.body)).toEqual([]);
    (main().querySelector('app-calendar-week button.item[data-status="declined"]') as HTMLElement).click();
    await settle();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `${F}/approvals`))).flush([DECISION]);
    await settle();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
