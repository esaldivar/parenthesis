import { CalendarEvent, FamilyMember } from '../../core/api/api';

/** Generic editing/cancellation follows the persisted caregiver, not the creator (#260). */
export function canManageEvent(event: CalendarEvent | null, members: readonly FamilyMember[]): boolean {
  const me = members.find((member) => member.isYou && member.role === 'Parent')?.membershipId;
  if (!event || !me) return false;
  if (event.category === 'ParentingTime') return event.caregiverMembershipId === me;
  if (event.category === 'Unavailable') return event.ownerMembershipId === me;
  return true;
}
