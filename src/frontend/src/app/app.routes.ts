import { Type } from '@angular/core';
import { CanMatchFn, Route, Routes } from '@angular/router';
import { hasFamily, kidSpace, needsFamily, pickerAvailable, registerPage, signedIn, signedOut } from './core/auth/guards';

/** A page inside the auth layout, under its own top-level path so nothing competes with the app at "/". */
function authPage(path: string, title: string, page: () => Promise<Type<unknown>>, canMatch: CanMatchFn[] = []): Route {
  return {
    path,
    canMatch,
    loadComponent: () => import('./features/auth/auth-layout').then((m) => m.AuthLayout),
    children: [{ path: '', title, loadComponent: page }],
  };
}

// Guards decide what to show; the API independently enforces authentication, membership and tenancy.
export const routes: Routes = [
  authPage('sign-in', 'Sign in', () => import('./features/auth/sign-in-page').then((m) => m.SignInPage), [signedOut]),
  authPage('register', 'Create your account', () => import('./features/auth/register-page').then((m) => m.RegisterPage), [registerPage]),
  authPage('check-email', 'Check your email', () => import('./features/auth/check-email-page').then((m) => m.CheckEmailPage)),
  authPage('confirm-email', 'Confirm your email', () => import('./features/auth/confirm-email-page').then((m) => m.ConfirmEmailPage)),
  authPage('forgot-password', 'Reset your password', () => import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage)),
  authPage('reset-password', 'Choose a new password', () => import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage)),
  // Opened from the invitation email; works signed in or out (the page asks signed-out visitors to sign in).
  authPage('invitations/accept', 'Join your co-parent’s family', () =>
    import('./features/invitations/accept-invitation-page').then((m) => m.AcceptInvitationPage),
  ),
  // After a password sign-in: "Is this a shared family device?" (#153). Nothing is registered without a "Yes".
  authPage('shared-device/setup', 'Is this a shared family device?', () =>
    import('./features/profiles/shared-device-setup-page').then((m) => m.SharedDeviceSetupPage), [signedIn, hasFamily],
  ),
  // "Who's using Parenthesis?" on a registered device (ADR-0006, ADR-0007).
  authPage('profiles', 'Who’s using Parenthesis?', () => import('./features/profiles/profile-picker-page').then((m) => m.ProfilePickerPage), [
    pickerAvailable,
  ]),
  authPage('profiles/parent/:id', 'Enter your parent PIN', () =>
    import('./features/profiles/parent-pin-page').then((m) => m.ParentPinPage), [pickerAvailable],
  ),
  authPage('profiles/parent/:id/password', 'Enter your password', () =>
    import('./features/profiles/parent-password-page').then((m) => m.ParentPasswordPage), [pickerAvailable],
  ),
  authPage('profiles/child/:id', 'Enter your PIN', () => import('./features/profiles/child-pin-page').then((m) => m.ChildPinPage), [
    pickerAvailable,
  ]),
  // On a child's own tablet: redeem a parent's one-time code (A-11).
  authPage('pair', 'Set up a child’s tablet', () => import('./features/profiles/pair-device-page').then((m) => m.PairDevicePage), [signedOut]),
  authPage('welcome', 'Set up your family', () => import('./features/onboarding/welcome-page').then((m) => m.WelcomePage), [
    signedIn,
    needsFamily,
  ]),
  {
    path: 'kid',
    canMatch: [kidSpace],
    loadComponent: () => import('./layout/kid-shell/kid-shell').then((m) => m.KidShell),
    loadChildren: () => import('./features/kid/kid.routes').then((m) => m.KID_ROUTES),
  },
  {
    path: '',
    canMatch: [signedIn, hasFamily],
    loadComponent: () => import('./layout/parent-shell/parent-shell').then((m) => m.ParentShell),
    loadChildren: () => import('./features/parent.routes').then((m) => m.PARENT_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
