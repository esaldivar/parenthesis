import { CalendarEvent } from '../../core/api/api';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { FORMER_PARENT, forChild, onDate, toItems } from './calendar-items';
import { itemSummary, statusText, whenText } from './item-text';

const items = (...events: CalendarEvent[]) => toItems(events, MEMBERS, CHILDREN, 'America/Chicago');

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
});
