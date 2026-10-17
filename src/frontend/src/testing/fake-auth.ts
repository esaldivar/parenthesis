import { computed, signal } from '@angular/core';
import { FamilySummary, Me } from '../app/core/api/api';
import { AuthStatus, AuthStore } from '../app/core/auth/auth.store';

/** A stand-in AuthStore for component and routing tests. Synthetic data only. */
export function fakeAuth(options: { signedIn?: boolean; families?: FamilySummary[] } = {}) {
  const user = signal<Me | null>(
    options.signedIn === false ? null : { id: 'user-1', email: 'alex@example.test', displayName: 'Alex Rivera' },
  );
  const families = signal<readonly FamilySummary[] | null>(
    options.families ?? [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }],
  );
  const fake = {
    user,
    status: signal<AuthStatus>(user() ? 'signed-in' : 'anonymous'),
    families,
    currentFamily: computed(() => families()?.[0] ?? null),
    loadFamilies: async () => families() ?? [],
    signOut: async () => {
      user.set(null);
      fake.status.set('anonymous');
    },
  };
  return { provide: AuthStore, useValue: fake as unknown as AuthStore };
}
