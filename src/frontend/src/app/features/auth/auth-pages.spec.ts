import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { AuthStore } from '../../core/auth/auth.store';

describe('auth and onboarding routes', () => {
  async function open(url: string, auth = fakeAuth({ signedIn: false })) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), auth],
    });
    const harness = await RouterTestingHarness.create(url);
    return { harness, http: TestBed.inject(HttpTestingController), body: document.body };
  }

  const routerOf = (harness: RouterTestingHarness) => harness.fixture.debugElement.injector.get(Router);

  const text = (body: HTMLElement) => body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  async function type(harness: RouterTestingHarness, selector: string, value: string) {
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  describe('guards', () => {
    it('sends signed-out visitors to sign-in and remembers where they were going', async () => {
      const { harness, body } = await open('/settings');

      expect(routerOf(harness).url).toBe('/sign-in?returnUrl=%2Fsettings');
      expect(body.querySelector('h1')!.textContent).toBe('Sign in');
    });

    it('sends a signed-in parent without a family to set one up', async () => {
      const { body } = await open('/', fakeAuth({ families: [] }));

      expect(text(body)).toContain('Set up your family space');
    });

    it('keeps signed-in users away from the sign-in page', async () => {
      const { body } = await open('/sign-in', fakeAuth());

      expect(text(body)).toContain('Today');
    });
  });

  describe('sign in', () => {
    it('explains a failed sign-in without saying which part was wrong', async () => {
      const { harness, body } = await open('/sign-in');
      const store = TestBed.inject(AuthStore) as unknown as { signIn: () => Promise<void> };
      store.signIn = () => Promise.reject(new HttpErrorResponse({ status: 401 }));

      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[type=password]', 'not the password');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      const alert = body.querySelector('[role=alert]')!.textContent!;
      expect(alert).toContain('couldn’t sign you in with that email and password');
      expect(alert).toContain('confirm your email first');
    });

    it('only returns to in-app paths after signing in', async () => {
      const { harness } = await open('/sign-in?returnUrl=%2F%2Fevil.example');
      const store = TestBed.inject(AuthStore) as unknown as { signIn: () => Promise<void>; shouldOfferSharedSetup: () => Promise<boolean> };
      store.signIn = async () => undefined;
      store.shouldOfferSharedSetup = async () => false;
      const navigated: string[] = [];
      const router = routerOf(harness);
      router.navigateByUrl = (async (url: string) => navigated.push(url)) as never;

      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[type=password]', 'correct horse battery staple');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(navigated).toEqual(['/']);
    });

    it('treats a backslash return URL as leaving the app', async () => {
      const { harness } = await open('/sign-in?returnUrl=%2F%5Cevil.example');
      const store = TestBed.inject(AuthStore) as unknown as { signIn: () => Promise<void>; shouldOfferSharedSetup: () => Promise<boolean> };
      store.signIn = async () => undefined;
      store.shouldOfferSharedSetup = async () => false;
      const navigated: string[] = [];
      const router = routerOf(harness);
      router.navigateByUrl = (async (url: string) => navigated.push(url)) as never;

      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[type=password]', 'correct horse battery staple');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(navigated).toEqual(['/']);
    });

    it('asks “Is this a shared family device?” after signing in, keeping where the parent was heading (#153)', async () => {
      const { harness } = await open('/sign-in?returnUrl=%2Fcalendar');
      const store = TestBed.inject(AuthStore) as unknown as { signIn: () => Promise<void>; shouldOfferSharedSetup: () => Promise<boolean> };
      store.signIn = async () => undefined;
      store.shouldOfferSharedSetup = async () => true;
      const navigated: unknown[] = [];
      const router = routerOf(harness);
      router.navigate = (async (commands: unknown[], extras: unknown) => navigated.push([commands, extras])) as never;

      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[type=password]', 'correct horse battery staple');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(navigated).toEqual([[['/shared-device/setup'], { queryParams: { returnUrl: '/calendar' } }]]);
    });
  });

  describe('register', () => {
    it('shows the API’s field errors next to the right field', async () => {
      const { harness, http, body } = await open('/register');

      await type(harness, 'input[autocomplete=name]', 'Alex Rivera');
      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[formcontrolname=password]', 'twelve chars ok');
      await type(harness, 'input[formcontrolname=confirmPassword]', 'twelve chars ok');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      http.expectOne('/api/auth/register').flush(
        { title: 'One or more validation errors occurred.', errors: { password: ['Passwords must be at least 12 characters.'] } },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle(harness);

      expect(text(body)).toContain('Passwords must be at least 12 characters.');
      expect(body.querySelector('[role=alert]')).toBeNull();
    });

    it('explains an invite-only site and who to ask', async () => {
      const { harness, http, body } = await open('/register');

      await type(harness, 'input[autocomplete=name]', 'Alex Rivera');
      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[formcontrolname=password]', 'twelve chars ok');
      await type(harness, 'input[formcontrolname=confirmPassword]', 'twelve chars ok');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      http.expectOne('/api/auth/register').flush(
        {
          title: 'Sign-up here is by invitation only.',
          detail: 'This is a test site. Ask the Parenthesis team to add your email address.',
        },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle(harness);

      expect(body.querySelector('[role=alert]')!.textContent!.trim()).toBe(
        'Sign-up here is by invitation only. This is a test site. Ask the Parenthesis team to add your email address.',
      );
    });

    it('checks password length before calling the API', async () => {
      const { harness, http, body } = await open('/register');

      await type(harness, 'input[autocomplete=name]', 'Alex Rivera');
      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[formcontrolname=password]', 'short');
      await type(harness, 'input[formcontrolname=confirmPassword]', 'short');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      http.expectNone('/api/auth/register');
      expect(text(body)).toContain('Use at least 12 characters.');
    });

    it('is for parents and asks for the password twice', async () => {
      const { harness, http, body } = await open('/register');

      expect(body.querySelector('h1')!.textContent).toBe('Create your Parenthesis account');
      await type(harness, 'input[autocomplete=name]', 'Alex Rivera');
      await type(harness, 'input[type=email]', 'alex@example.test');
      await type(harness, 'input[formcontrolname=password]', 'twelve chars ok');
      await type(harness, 'input[formcontrolname=confirmPassword]', 'twelve chars no');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      http.expectNone('/api/auth/register');
      expect(text(body)).toContain('The passwords don’t match.');
    });

    it('keeps an invitation from a "sign up to join" email and takes it off the address bar', async () => {
      localStorage.clear();
      const { harness, body } = await open('/register?token=invite-123');
      await settle(harness);

      expect(text(body)).toContain('You’ve been invited to join your co-parent’s family');
      expect(routerOf(harness).url).toBe('/register');
      expect(localStorage.getItem('parenthesis.pendingInvitation')).toContain('invite-123');
      localStorage.clear();
    });
  });

  describe('confirm email', () => {
    it('confirms with the token from the link and removes it from the address bar', async () => {
      const { harness, http, body } = await open('/confirm-email?userId=u1&token=abc');

      const request = http.expectOne('/api/auth/confirm-email');
      expect(request.request.body).toEqual({ userId: 'u1', token: 'abc' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(harness);

      expect(text(body)).toContain('Your email is confirmed');
      expect(routerOf(harness).url).toBe('/confirm-email');
    });

    it('explains an invalid or expired link', async () => {
      const { harness, http, body } = await open('/confirm-email?userId=u1&token=used');

      http.expectOne('/api/auth/confirm-email').flush({ title: 'This link is invalid or has expired.' }, { status: 400, statusText: 'Bad Request' });
      await settle(harness);

      expect(text(body)).toContain('This link is invalid or has expired.');
    });
  });

  describe('forgot password', () => {
    it('gives the same answer whether or not the account exists', async () => {
      const { harness, http, body } = await open('/forgot-password');

      await type(harness, 'input[type=email]', 'nobody@example.test');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      http.expectOne('/api/auth/forgot-password').flush(null, { status: 202, statusText: 'Accepted' });
      await settle(harness);

      expect(text(body)).toContain('If there’s an account for that email, a reset link is on its way.');
    });
  });

  it.each(['/sign-in', '/register', '/forgot-password', '/check-email'])(
    'has no automatically detectable accessibility issues at %s',
    async (url) => {
      const { body } = await open(url);

      expect(await axeViolations(body)).toEqual([]);
    },
  );
});
