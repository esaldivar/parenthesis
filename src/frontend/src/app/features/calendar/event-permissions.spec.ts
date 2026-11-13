import { MEMBERS, event } from '../../../testing/calendar-fixtures';
import { canManageEvent } from './event-permissions';

describe('event management permissions', () => {
  it.each(['m-alex', 'm-sam'])('uses the persisted caregiver for either signed-in parent (%s)', (membershipId) => {
    const members = MEMBERS.map((member) => ({ ...member, isYou: member.membershipId === membershipId }));
    const other = membershipId === 'm-alex' ? 'm-sam' : 'm-alex';
    expect(canManageEvent(event({ category: 'ParentingTime', caregiverMembershipId: membershipId, ownerMembershipId: other }), members)).toBe(true);
    expect(canManageEvent(event({ category: 'ParentingTime', caregiverMembershipId: other, ownerMembershipId: membershipId }), members)).toBe(false);
  });

  it('fails closed without a known parent or caregiver', () => {
    expect(canManageEvent(null, MEMBERS)).toBe(false);
    expect(canManageEvent(event(), [])).toBe(false);
    expect(canManageEvent(event({ category: 'ParentingTime' }), MEMBERS)).toBe(false);
    expect(canManageEvent(event(), MEMBERS.map((member) => ({ ...member, role: 'Child' })))).toBe(false);
  });

  it('preserves unavailable ownership and shared activity editing', () => {
    expect(canManageEvent(event({ category: 'Unavailable', ownerMembershipId: 'm-sam' }), MEMBERS)).toBe(false);
    expect(canManageEvent(event({ category: 'Unavailable' }), MEMBERS)).toBe(true);
    expect(canManageEvent(event({ ownerMembershipId: 'm-sam' }), MEMBERS)).toBe(true);
  });
});
