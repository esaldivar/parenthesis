import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** Signed-out visitors go to sign-in, and come back to where they were heading afterwards. */
export const signedIn: CanMatchFn = (_route, segments) => {
  if (inject(AuthStore).status() === 'signed-in') {
    return true;
  }
  const returnUrl = '/' + segments.map((s) => s.path).join('/');
  return inject(Router).createUrlTree(['/sign-in'], { queryParams: returnUrl === '/' ? {} : { returnUrl } });
};

/** Sign-in and registration pages are for signed-out visitors. */
export const signedOut: CanMatchFn = () =>
  inject(AuthStore).status() !== 'signed-in' || inject(Router).createUrlTree(['/']);

/** A signed-in parent without a family yet sets one up first. */
export const hasFamily: CanMatchFn = async () => {
  // Inject before awaiting: the injection context ends at the first await.
  const auth = inject(AuthStore);
  const router = inject(Router);

  // canMatch guards run in parallel; when nobody is signed in, `signedIn` redirects and this one stays out of it.
  if (auth.status() !== 'signed-in') {
    return true;
  }
  const families = auth.families() ?? (await auth.loadFamilies().catch(() => []));
  return families.length > 0 || router.createUrlTree(['/welcome']);
};
