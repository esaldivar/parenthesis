import { computed, signal } from '@angular/core';
import { ChildSession, DeviceProfiles, FamilySummary, Me } from '../app/core/api/api';
import { AuthStatus, AuthStore } from '../app/core/auth/auth.store';

/** A stand-in AuthStore for component and routing tests. Synthetic data only. */
export function fakeAuth(
  options: { signedIn?: boolean; families?: FamilySummary[]; child?: ChildSession; device?: DeviceProfiles } = {},
) {
  const user = signal<Me | null>(
    options.signedIn === false || options.child ? null : { id: 'user-1', email: 'alex@example.test', displayName: 'Alex Rivera' },
  );
  const child = signal<ChildSession | null>(options.child ?? null);
  const device = signal<DeviceProfiles | null>(options.device ?? null);
  const families = signal<readonly FamilySummary[] | null>(
    options.families ?? [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }],
  );
  const fake = {
    user,
    child,
    device,
    status: signal<AuthStatus>(user() ? 'signed-in' : child() ? 'child' : 'anonymous'),
    loadDevice: async () => device(),
    families,
    currentFamily: computed(() => families()?.[0] ?? null),
    loadFamilies: async () => families() ?? [],
    signOut: async () => {
      user.set(null);
      child.set(null);
      fake.status.set('anonymous');
    },
    deleteAccount: async () => {
      user.set(null);
      fake.status.set('anonymous');
    },
    // Resolve by default; a test replaces them (vi.spyOn) to simulate the API's answers.
    signIn: async () => {
      user.set({ id: 'user-1', email: 'alex@example.test', displayName: 'Alex Rivera' });
      fake.status.set('signed-in');
    },
    childSignIn: async (childId: string) => {
      child.set({ childId, firstName: 'Kai', familyId: 'family-1' });
      fake.status.set('child');
    },
    parentPinSignIn: async () => {
      user.set({ id: 'user-1', email: 'alex@example.test', displayName: 'Alex Rivera' });
      fake.status.set('signed-in');
    },
    switchProfile: async () => {
      user.set(null);
      child.set(null);
      fake.status.set('anonymous');
    },
    // Whether sign-in asks "Is this a shared family device?". No by default; a test turns it on.
    shouldOfferSharedSetup: async () => false,
    declineSharedSetup: () => undefined,
    setUpSharedDevice: async () => {
      device.set({
        familyName: 'Rivera Family',
        deviceKind: 'Household',
        isYours: true,
        profiles: [{ kind: 'parent', id: 'm1', name: 'Alex', canSignIn: true, locked: false }],
      });
    },
    pairDevice: async () => {
      device.set({
        familyName: 'Rivera Family',
        deviceKind: 'ChildPaired',
        profiles: [{ kind: 'child', id: 'kai', name: 'Kai', canSignIn: true, locked: false }],
      });
      return { childId: 'kai', childFirstName: 'Kai' };
    },
  };
  return { provide: AuthStore, useValue: fake as unknown as AuthStore };
}
