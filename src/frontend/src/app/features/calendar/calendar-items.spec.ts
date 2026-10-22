import { CalendarEvent } from '../../core/api/api';
import { CHILDREN, MEMBERS, event, reminder } from '../../../testing/calendar-fixtures';
import { FORMER_PARENT, forChild, onDate, reminderItems, toItems } from './calendar-items';
import { itemSummary, statusText, whenText } from './item-text';

const ZONE = 'America/Chicago';
const items = (...events: CalendarEvent[]) => toItems(events, MEMBERS, CHILDREN, ZONE);

describe('calendar items', () => {
  it('reads an activity in the family’s time zone', () => {
    const [item] = items(event());

    expect(item.kind).toBe('activity');
    expect(item.start).toBe('2026-10-20T10:00');
    expect(whenText(item)).toBe('10:00 AM – 11:30 AM');
    expect(item.spansDays).toBe(false);
    expect(item.isMine).toBe(true);
    expect(statusText(item)).toBeNull();
  });

  it('never shows a pending item as confirmed', () => {
    const [pending] = items(event({ category: 'ParentingTime', status: 'PendingApproval', caregiverMembershipId: 'm-sam' }));
    const [changing] = items(event({ pendingChange: 'Cancel' }));

    expect(pending.status).toBe('pending');
    expect(statusText(pending)).toBe('Pending approval');
    expect(itemSummary(pending)).toContain('Pending approval');
    expect(itemSummary(pending)).not.toContain('Confirmed');
    expect(changing.status).toBe('change-pending');
    expect(statusText(changing)).toBe('Cancellation pending');
  });

  it('shows both parents on a family event, the caregiver on parenting time, and the owner on unavailable time', () => {
    const [family, parenting, away] = items(
      event({ id: 'f', category: 'Joint', childIds: [] }),
      event({ id: 'p', category: 'ParentingTime', caregiverMembershipId: 'm-sam' }),
      event({ id: 'u', category: 'Unavailable', title: 'Unavailable', childIds: [], ownerMembershipId: 'm-sam' }),
    );

    expect(family.parents.map((p) => p.name)).toEqual(['Alex', 'Sam']);
    expect(family.children).toEqual([]);
    expect(parenting.parents.map((p) => p.name)).toEqual(['Sam']);
    expect(away.kind).toBe('unavailable');
    expect(away.isMine).toBe(false);
  });

  it('shows someone else’s unavailable time only as “Unavailable”, whatever the API sends', () => {
    const [theirs, mine] = items(
      event({ id: 'u', category: 'Unavailable', title: 'Doctor appointment', location: 'North Clinic', notes: 'Private', childIds: [], ownerMembershipId: 'm-sam' }),
      event({ id: 'v', category: 'Unavailable', title: 'Unavailable', notes: 'My note', childIds: [], ownerMembershipId: 'm-alex' }),
    );

    expect([theirs.title, theirs.location, theirs.notes]).toEqual(['Unavailable', null, null]);
    expect(mine.notes).toBe('My note');
  });

  it('calls a parent who left “Former parent”', () => {
    const [item] = items(event({ ownerMembershipId: 'm-gone' }));
    expect(item.ownerName).toBe(FORMER_PARENT);
  });

  it('puts all-day and multi-day items on each of their dates only', () => {
    const [trip] = items(
      event({ allDay: true, startsAt: '2026-10-20T05:00:00Z', endsAt: '2026-10-23T05:00:00Z', category: 'Unavailable', childIds: [] }),
    );

    expect(trip.spansDays).toBe(true);
    expect(whenText(trip)).toBe('Oct 20 – Oct 22');
    expect(onDate([trip], '2026-10-19')).toEqual([]);
    expect(onDate([trip], '2026-10-22')).toEqual([trip]);
    expect(onDate([trip], '2026-10-23')).toEqual([]);
  });

  it('filters by child, keeping items with no children (unavailable time, parents-only events)', () => {
    const all = items(
      event({ id: 'kai' }),
      event({ id: 'aurora', childIds: ['aurora'] }),
      event({ id: 'away', category: 'Unavailable', childIds: [] }),
    );

    expect(forChild(all, 'aurora').map((i) => i.id)).toEqual(['aurora', 'away']);
    expect(forChild(all, null)).toHaveLength(3);
  });

  it('reads a reminder as a moment with its own kind and label, one item per occurrence', () => {
    const [first, second] = reminderItems(
      [reminder(), reminder({ startsAt: '2026-10-27T13:00:00Z', repeat: 'Weekly', repeatCount: 2 })],
      MEMBERS,
      CHILDREN,
      ZONE,
    );

    expect(first).toEqual(
      expect.objectContaining({
        kind: 'reminder',
        categoryLabel: 'Reminder',
        icon: 'bell',
        start: '2026-10-20T08:00',
        firstDate: '2026-10-20',
        spansDays: false,
        status: 'confirmed',
        reminderId: 'r1',
        ownerName: 'Sam',
        location: null,
      }),
    );
    expect(first.children).toEqual([{ id: 'kai', name: 'Kai' }]);
    expect(whenText(first)).toBe('8:00 AM');
    expect(statusText(first)).toBeNull();
    expect(itemSummary(first)).toContain('Spirit Day, Reminder, 8:00 AM');
    expect(second.id).not.toBe(first.id);
    expect(second.reminderId).toBe(first.reminderId);
  });

  it('puts an all-day reminder in the all-day row and drops a child who isn’t active', () => {
    const [item] = reminderItems(
      [reminder({ allDay: true, startsAt: '2026-10-20T05:00:00Z', childId: 'gone', createdByMembershipId: 'm-left' })],
      MEMBERS,
      CHILDREN,
      ZONE,
    );

    expect(item.spansDays).toBe(true);
    expect(whenText(item)).toBe('All day');
    expect(item.children).toEqual([]);
    expect(item.ownerName).toBe(FORMER_PARENT);
  });
});
