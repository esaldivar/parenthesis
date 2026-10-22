import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CHILDREN, MEMBERS, event, reminder, task } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { LiveDashboardDataSource } from './dashboard-data';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

describe('the live dashboard source (#196)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), fakeAuth()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the week in the family’s time zone and maps it without leaking private notes', async () => {
    const loading = TestBed.inject(LiveDashboardDataSource).load('family-1', '2026-10-18');

    const events = http.expectOne((r) => r.url === `${F}/calendar/events`);
    // Sunday October 18 to the next Sunday, midnight in Chicago (CDT).
    expect(events.request.params.get('from')).toBe('2026-10-18T05:00:00.000Z');
    expect(events.request.params.get('to')).toBe('2026-10-25T05:00:00.000Z');
    const tasks = http.expectOne((r) => r.url === `${F}/calendar/tasks`);
    expect([tasks.request.params.get('from'), tasks.request.params.get('to')]).toEqual(['2026-10-18', '2026-10-25']);
    http.expectOne(F).flush(FAMILY);
    http.expectOne(`${F}/children`).flush(CHILDREN);
    events.flush([
      event({ id: 'pt', title: 'Time with Sam', category: 'ParentingTime', caregiverMembershipId: 'm-sam', childIds: ['kai', 'aurora'], allDay: true, startsAt: '2026-10-19T05:00:00Z', endsAt: '2026-10-21T05:00:00Z' }),
      event({ id: 'new', title: 'Time with Alex', category: 'ParentingTime', caregiverMembershipId: 'm-alex', status: 'PendingApproval', childIds: ['kai'] }),
      event({ id: 'play', title: 'School play', category: 'Joint', childIds: [] }),
      event({ id: 'away', title: 'Unavailable', category: 'Unavailable', childIds: [], ownerMembershipId: 'm-sam', notes: 'Private reason' }),
      event({ id: 'mine', title: 'Unavailable', category: 'Unavailable', childIds: [], ownerMembershipId: 'm-alex' }),
      event({ id: 'soccer', title: 'Soccer practice', category: 'Activity', pendingChange: 'Modify' }),
    ]);
    http.expectOne(`${F}/approvals`).flush([
      { id: 'r1', summary: 'Add: Time with Alex, Oct 20', status: 'Pending', canDecide: false, proposerMembershipId: 'm-alex' },
      { id: 'r2', summary: 'Change Soccer practice', status: 'Pending', canDecide: true, proposerMembershipId: 'm-sam' },
    ]);
    http.expectOne((r) => r.url === `${F}/calendar/reminders`).flush([reminder()]);
    tasks.flush([task(), task({ id: 't2', title: 'Already done', completedAt: '2026-10-19T12:00:00Z', completedBy: 'm-sam' })]);
    const week = await loading;

    expect(week.source).toBe('live');
    // Parenting time is one entry per child, with its caregiver; pending reads as proposed.
    expect(week.parentingTime.map((p) => [p.child.name, p.caregiver.displayName, p.status, p.start, p.end])).toEqual([
      ['Kai', 'Sam', 'confirmed', '2026-10-19T00:00', '2026-10-21T00:00'],
      ['Aurora', 'Sam', 'confirmed', '2026-10-19T00:00', '2026-10-21T00:00'],
      ['Kai', 'Alex', 'proposed', '2026-10-20T10:00', '2026-10-20T11:30'],
    ]);
    expect(week.events.map((e) => [e.title, e.category, e.date, e.time, e.durationMinutes])).toEqual([
      ['School play', 'family', '2026-10-20', '10:00', 90],
      ['Sam is unavailable', 'unavailable', '2026-10-20', '10:00', 90],
      ['You’re unavailable', 'unavailable', '2026-10-20', '10:00', 90],
      ['Soccer practice', 'sport', '2026-10-20', '10:00', 90],
    ]);
    expect(week.events[0].parents?.map((p) => p.displayName)).toEqual(['Alex', 'Sam']);
    expect(JSON.stringify(week)).not.toContain('Private reason');
    // Only what waits on this parent.
    expect(week.pendingReviews).toEqual([{ id: 'r2', summary: 'Change Soccer practice', proposedBy: 'Sam' }]);
    // Reminders and tasks for Upcoming; done tasks left out.
    expect(week.notes?.map((n) => [n.kind, n.title, n.date, n.time, n.children.map((c) => c.name)])).toEqual([
      ['reminder', 'Spirit Day', '2026-10-20', '08:00', ['Kai']],
      ['task', 'Science fair poster', '2026-10-22', undefined, ['Kai']],
    ]);
    expect([week.kidShares, week.recentMessages, week.recentMemories]).toEqual([[], [], []]);
  });
});
