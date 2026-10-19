import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlSegment, UrlTree } from '@angular/router';
import { AuthStore } from './auth.store';

/**
 * Where a signed-out visitor goes: the profile picker on a registered device, otherwise sign-in (coming back to where
 * they were heading afterwards).
 */
function signedOutRedirect(auth: AuthStore, router: Router, segments: UrlSegment[]): UrlTree {
  if (auth.device()) {
    return router.createUrlTree(['/profiles']);
  }
  const returnUrl = '/' + segments.map((s) => s.path).join('/');
  return router.createUrlTree(['/sign-in'], { queryParams: returnUrl === '/' ? {} : { returnUrl } });
}

/** The parent app: parents only. A child goes to their own space; signed-out visitors to the picker or sign-in. */
export const signedIn: CanMatchFn = (_route, segments) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  switch (auth.status()) {
    case 'signed-in':
      return true;
    case 'child':
      return router.createUrlTree(['/kid']);
    default:
      return signedOutRedirect(auth, router, segments);
  }
};

/** The children's space: a signed-in child, or a parent previewing it. */
export const kidSpace: CanMatchFn = (_route, segments) => {
  const auth = inject(AuthStore);
  const status = auth.status();
  return status === 'child' || status === 'signed-in' || signedOutRedirect(auth, inject(Router), segments);
};

/** Sign-in and registration pages are for signed-out visitors (a child may use sign-in to switch to a parent). */
export const signedOut: CanMatchFn = () =>
  inject(AuthStore).status() !== 'signed-in' || inject(Router).createUrlTree(['/']);

/** "Who's using Parenthesis?" needs a registered device and nobody signed in (switching profiles signs out first). */
export const pickerAvailable: CanMatchFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  switch (auth.status()) {
    case 'signed-in':
      return router.createUrlTree(['/']);
    case 'child':
      return router.createUrlTree(['/kid']);
    default:
      return auth.device() !== null || router.createUrlTree(['/sign-in']);
  }
};

/** A signed-in parent without a family yet sets one up first. */
export const hasFamily: CanMatchFn = async () => {
  // Inject before awaiting: the injection context ends at the first await.
  const auth = inject(AuthStore);
  const router = inject(Router);

  // canMatch guards run in parallel; when no parent is signed in, `signedIn` redirects and this one stays out of it.
  if (auth.status() !== 'signed-in') {
    return true;
  }
  const families = auth.families() ?? (await auth.loadFamilies().catch(() => []));
  return families.length > 0 || router.createUrlTree(['/welcome']);
};
