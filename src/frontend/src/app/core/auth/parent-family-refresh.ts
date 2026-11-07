import { Signal, computed, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from './auth.store';

/**
 * The signed-in parent's family id, for stores behind a navigation dot. When it changes, `reset` clears what the
 * last family showed and `refresh` reads again; `refresh` also runs after every navigation and when the tab comes back,
 * so a dot appears without a reload. A child's session gives null and never reads anything.
 */
export function parentFamilyRefresh(reset: () => void, refresh: () => Promise<void>): Signal<string | null> {
  const auth = inject(AuthStore);
  const router = inject(Router, { optional: true });
  const familyId = computed(() => {
    const family = auth.currentFamily();
    return auth.status() === 'signed-in' && family?.role === 'Parent' ? family.id : null;
  });
  effect(() => {
    const id = familyId();
    untracked(() => {
      reset();
      if (id) void refresh();
    });
  });
  router?.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => void refresh());
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refresh();
    });
  }
  return familyId;
}
