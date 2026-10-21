import { CalendarEvent, Child, FamilyMember } from '../app/core/api/api';

// Synthetic family only.
export const MEMBERS: FamilyMember[] = [
  { membershipId: 'm-alex', displayName: 'Alex', role: 'Parent', joinedAt: '2026-10-01T00:00:00Z', isYou: true },
  { membershipId: 'm-sam', displayName: 'Sam', role: 'Parent', joinedAt: '2026-10-02T00:00:00Z', isYou: false },
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

