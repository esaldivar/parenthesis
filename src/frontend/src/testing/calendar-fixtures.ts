import { CalendarEvent, ChecklistItem, Child, FamilyMember, Reminder, SharedTask } from '../app/core/api/api';

// Synthetic family only.
export const MEMBERS: FamilyMember[] = [
  { membershipId: 'm-alex', displayName: 'Alex', role: 'Parent', joinedAt: '2026-10-01T00:00:00Z', paletteSlot: 0, isYou: true },
  { membershipId: 'm-sam', displayName: 'Sam', role: 'Parent', joinedAt: '2026-10-02T00:00:00Z', paletteSlot: 1, isYou: false },
];
export const child = (id: string, firstName: string): Child => ({
  id,
  firstName,
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: false, locked: false, pinChangePending: false },
});
export const CHILDREN = [child('kai', 'Kai'), child('aurora', 'Aurora')];

export function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title: 'Soccer practice',
    category: 'Activity',
    startsAt: '2026-10-20T15:00:00Z',
    endsAt: '2026-10-20T16:30:00Z',
    allDay: false,
    location: null,
    notes: null,
    status: 'Confirmed',
    childIds: ['kai'],
    caregiverMembershipId: null,
    ownerMembershipId: 'm-alex',
    confirmedBeforeCoParentJoined: false,
    changeRequestId: null,
    pendingChange: 'None',
    proposed: null,
    warnings: [],
    ...over,
  };
}


/** A shared reminder: Tuesday, October 20, 2026, 8:00 AM in Chicago, added by Sam. */
export function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Spirit Day',
    startsAt: '2026-10-20T13:00:00Z',
    allDay: false,
    childId: 'kai',
    details: 'Wear a blue shirt',
    createdByMembershipId: 'm-sam',
    createdAt: '2026-10-18T12:00:00Z',
    editedBy: null,
    lastEditedAt: null,
    seenBy: [],
    repeat: 'None',
    repeatUntil: null,
    repeatCount: null,
    seriesStartsAt: '2026-10-20T13:00:00Z',
    ...over,
  };
}

/** A shared task due Thursday, October 22, 2026, about Kai, added by Sam, with no checklist. */
export function task(over: Partial<SharedTask> = {}): SharedTask {
  return {
    id: 't1',
    title: 'Science fair poster',
    dueDate: '2026-10-22',
    childId: 'kai',
    details: 'Glue and markers',
    createdByMembershipId: 'm-sam',
    createdAt: '2026-10-18T12:00:00Z',
    editedBy: null,
    lastEditedAt: null,
    completedBy: null,
    completedAt: null,
    seenBy: [],
    items: [],
    progressDone: 0,
    progressTotal: 0,
    version: 7,
    justCompleted: false,
    ...over,
  };
}

export function checklistItem(over: Partial<ChecklistItem> = {}): ChecklistItem {
  return { id: 'i1', text: 'Poster board', required: true, completedBy: null, completedAt: null, ...over };
}
