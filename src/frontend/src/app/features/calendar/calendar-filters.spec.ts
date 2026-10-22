import { CHILDREN, MEMBERS, event, reminder, task } from '../../../testing/calendar-fixtures';
import { ALL_FILTERS, CalendarFilters, activeDimensions, applyFilters, filtersKey, parseFilters, selectionText } from './calendar-filters';
import { reminderItems, taskItems, toItems } from './calendar-items';

const ZONE = 'America/Chicago';
const ME = 'm-alex';

// Synthetic family: Alex (you) and Sam; Kai and Aurora.
const items = [
  ...toItems(
    [
      event({ id: 'soccer', title: 'Soccer', category: 'Activity', ownerMembershipId: 'm-alex' }),
      // Alex added Sam's parenting time: created by me, involving the co-parent.
      event({ id: 'sam-time', title: 'Time with Sam', category: 'ParentingTime', caregiverMembershipId: 'm-sam', ownerMembershipId: 'm-alex' }),
      event({ id: 'play', title: 'School play', category: 'Joint', status: 'PendingApproval', childIds: [], ownerMembershipId: 'm-sam' }),
      event({ id: 'away', title: 'Unavailable', category: 'Unavailable', childIds: [], ownerMembershipId: 'm-sam' }),
      event({ id: 'dentist', title: 'Dentist', category: 'Dental', pendingChange: 'Modify', ownerMembershipId: 'm-sam' }),
    ],
    MEMBERS,
    CHILDREN,
    ZONE,
  ),
  ...reminderItems([reminder()], MEMBERS, CHILDREN, ZONE),
  ...taskItems([task()], MEMBERS, CHILDREN),
];
const titles = (filters: Partial<CalendarFilters>) => applyFilters(items, { ...ALL_FILTERS, ...filters }, ME).map((i) => i.title);

describe('calendar filters', () => {
  it('shows everything by default', () => {
    expect(titles({})).toHaveLength(7);
    expect(activeDimensions(ALL_FILTERS)).toEqual([]);
  });

  it('matches any ticked type (OR within a dimension)', () => {
    expect(titles({ types: ['parenting', 'task'] })).toEqual(['Time with Sam', 'Science fair poster']);
  });

  it('keeps who created an item apart from who it involves, and never uses the caregiver as the creator', () => {
    expect(titles({ parents: ['created-by-me'] })).toEqual(['Soccer', 'Time with Sam']);
    expect(titles({ parents: ['involves-me'] })).toEqual(['School play']);
    // Sam's parenting time involves Sam even though Alex created it; the family event involves both.
    expect(titles({ parents: ['involves-co-parent'] })).toEqual(['Time with Sam', 'School play', 'Unavailable']);
  });

  it('needs every dimension to match (AND across dimensions)', () => {
    expect(titles({ types: ['parenting', 'family'], parents: ['involves-me'] })).toEqual(['School play']);
  });

  it('filters by approval, and never gives tasks or reminders an approval state', () => {
    expect(titles({ approval: ['pending'] })).toEqual(['School play']);
    expect(titles({ approval: ['change-pending'] })).toEqual(['Dentist']);
    expect(titles({ approval: ['confirmed', 'change-pending'] })).toEqual(['Soccer', 'Time with Sam', 'Unavailable', 'Dentist']);
  });

  it('matches nothing when nothing is ticked in a dimension', () => {
    expect(titles({ types: [] })).toEqual([]);
    expect(selectionText({ ...ALL_FILTERS, types: [] }, 'types')).toBe('None');
    expect(selectionText({ ...ALL_FILTERS, types: ['task', 'reminder'] }, 'types')).toBe('Task, Reminder');
    expect(selectionText({ ...ALL_FILTERS, types: ALL_FILTERS.types.filter((t) => t !== 'unavailable') }, 'types')).toBe(
      'hiding Unavailable',
    );
  });

  it('reads saved filters safely, keeping only known values', () => {
    expect(parseFilters(null)).toEqual(ALL_FILTERS);
    expect(parseFilters('not json')).toEqual(ALL_FILTERS);
    expect(parseFilters(JSON.stringify({ types: ['task', 'bogus'], approval: 'pending' }))).toEqual({
      ...ALL_FILTERS,
      types: ['task'],
    });
    expect(filtersKey('user-1', 'family-1')).toBe('parenthesis.calendar-filters.user-1.family-1');
  });
});
