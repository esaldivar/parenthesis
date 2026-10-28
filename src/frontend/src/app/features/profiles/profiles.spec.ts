import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { DeviceProfiles } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';

// Synthetic family only.
const PICKER: DeviceProfiles = {
  familyName: 'Rivera Family',
  deviceKind: 'Household',
  profiles: [
    { kind: 'parent', id: 'dad', name: 'Dad', canSignIn: true, locked: false },
    { kind: 'child', id: 'kai', name: 'Kai', canSignIn: true, locked: false },
    { kind: 'child', id: 'aurora', name: 'Aurora', canSignIn: false, locked: false },
  ],
};

const lockedKai: DeviceProfiles = {
  ...PICKER,
  profiles: PICKER.profiles.map((p) => (p.id === 'kai' ? { ...p, locked: true } : p)),
};

const pausedKai: DeviceProfiles = {
  ...PICKER,
  profiles: PICKER.profiles.map((p) => (p.id === 'kai' ? { ...p, pausedUntil: '2099-01-01T10:10:00Z' } : p)),
};

const dadWithoutPin: DeviceProfiles = {
  ...PICKER,
  profiles: PICKER.profiles.map((p) => (p.id === 'dad' ? { ...p, canSignIn: false } : p)),
};

function problem(status: number, body: object): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('profile picker, parent PIN, parent password and child PIN (ADR-0006, #153)', () => {
  async function open(url: string, auth = fakeAuth({ signedIn: false, device: PICKER })) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), auth],
    });
    const harness = await RouterTestingHarness.create(url);
    await settle(harness);
    return { harness, body: document.body, auth: TestBed.inject(AuthStore), router: TestBed.inject(Router) };
  }

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  const text = (body: HTMLElement) => body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  function type(harness: RouterTestingHarness, selector: string, value: string) {
    const input = document.body.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  async function submit(harness: RouterTestingHarness) {
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    await settle(harness);
  }

  describe('the picker', () => {
    it('shows the device’s parent and children by name, and only links profiles that can sign in', async () => {
      const { body } = await open('/profiles');

      expect(body.querySelector('h1')!.textContent).toBe('Who’s using Parenthesis?');
      expect(text(body)).toContain('Rivera Family');
      const links = [...body.querySelectorAll<HTMLAnchorElement>('.tiles a')].map((a) => a.getAttribute('href'));
      expect(links).toEqual(['/profiles/parent/dad', '/profiles/child/kai']);
      expect(text(body)).toContain('A parent needs to set up a PIN first');
    });

    it('marks a locked or paused PIN', async () => {
      const locked = await open('/profiles', fakeAuth({ signedIn: false, device: lockedKai }));
      expect(locked.body.querySelector('.tiles a[href="/profiles/child/kai"]')!.textContent).toContain('PIN locked');
      TestBed.resetTestingModule();

      const paused = await open('/profiles', fakeAuth({ signedIn: false, device: pausedKai }));
      expect(paused.body.querySelector('.tiles a[href="/profiles/child/kai"]')!.textContent).toContain('PIN paused');
    });

    it('sends a parent without a parent PIN to password sign-in', async () => {
      const { body } = await open('/profiles', fakeAuth({ signedIn: false, device: dadWithoutPin }));

      expect(body.querySelector('.tiles a')!.getAttribute('href')).toBe('/profiles/parent/dad/password');
    });

    it('shows no earlier profiles when the picker can’t be loaded, and offers to try again', async () => {
      const auth = fakeAuth({ signedIn: false, device: PICKER });
      const store = auth.useValue as unknown as { loadDevice: () => Promise<unknown> };
      store.loadDevice = () => Promise.reject(new HttpErrorResponse({ status: 0 }));

      const { body } = await open('/profiles', auth);

      expect(body.querySelector('.tiles')).toBeNull();
      expect(text(body)).not.toContain('Kai');
      expect(body.querySelector('[role="alert"]')!.textContent).toContain('We couldn’t load the profiles.');
      expect(body.querySelector('main button')!.textContent).toContain('Try again');
    });

    it('explains a removed or expired device without showing its old profiles', async () => {
      const auth = fakeAuth({ signedIn: false, device: PICKER });
      const store = auth.useValue as unknown as { device: { set(v: null): void }; loadDevice: () => Promise<null> };
      store.loadDevice = async () => {
        store.device.set(null); // The server no longer recognises this device.
        return null;
      };

      const { body } = await open('/profiles', auth);

      expect(body.querySelector('.tiles')).toBeNull();
      expect(text(body)).toContain('isn’t set up for sharing right now');
      expect(text(body)).toContain('sign in with their email and password and set it up again');
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await open('/profiles');

      expect(await axeViolations(body)).toEqual([]);
    });

    it('sends a signed-out visitor on a registered device to the picker instead of sign-in', async () => {
      const { router } = await open('/settings');

      expect(router.url).toBe('/profiles');
    });

    it('is only for registered devices', async () => {
      const { router } = await open('/profiles', fakeAuth({ signedIn: false }));

      expect(router.url).toBe('/sign-in');
    });

    it('keeps a signed-in child in their own space', async () => {
      const child = fakeAuth({ child: { childId: 'kai', firstName: 'Kai', familyId: 'family-1' }, device: PICKER });

      expect((await open('/settings', child)).router.url).toBe('/kid');
    });

    it('shows a child only the switch-profile option in their settings, never parent pages', async () => {
      const { body } = await open('/kid/settings', fakeAuth({ child: { childId: 'kai', firstName: 'Kai', familyId: 'family-1' }, device: PICKER }));

      expect(text(body)).toContain('Switch profile');
      expect(body.querySelector('.preview')).toBeNull();
    });

    it('tells a parent previewing the children’s space how to get back', async () => {
      const { body } = await open('/kid', fakeAuth());

      expect(body.querySelector('.preview')!.textContent).toContain('previewing the children’s space');
    });
  });

  describe('a parent tile', () => {
    it('asks for the parent’s six-digit PIN and signs them in', async () => {
      const { harness, body, auth, router } = await open('/profiles/parent/dad');
      const signIn = vi.spyOn(auth, 'parentPinSignIn');

      expect(body.querySelector('h1')!.textContent).toBe('Hi, Dad');
      expect(body.querySelector('label')!.textContent).toContain('Parent PIN');
      type(harness, 'input[inputmode="numeric"]', '583920');
      await submit(harness);

      expect(signIn).toHaveBeenCalledWith('dad', '583920');
      expect(router.url).toBe('/');
    });

    it('rejects anything but six digits without asking the server', async () => {
      const { harness, body, auth } = await open('/profiles/parent/dad');
      const signIn = vi.spyOn(auth, 'parentPinSignIn');

      type(harness, 'input[inputmode="numeric"]', '2580');
      await submit(harness);

      expect(signIn).not.toHaveBeenCalled();
      expect(text(body)).toContain('Your parent PIN is 6 numbers.');
    });

    it('shows the pause with its retry time, and only says an email was sent when it was', async () => {
      const { harness, body, auth } = await open('/profiles/parent/dad');
      vi.spyOn(auth, 'parentPinSignIn').mockRejectedValue(
        problem(423, { title: 'Your parent PIN is paused.', state: 'paused', retryAt: '2099-01-01T10:10:00Z', notified: false }),
      );

      type(harness, 'input[inputmode="numeric"]', '111222');
      await submit(harness);

      expect(text(body)).toContain('Your parent PIN is paused.');
      expect(text(body)).toContain('You can try again after');
      expect(text(body)).toContain('We couldn’t send you an email about this right now.');
      expect(text(body)).not.toContain('We’ve emailed you');
      expect(body.querySelector('main form')).toBeNull();
      expect(body.querySelector('a[href="/profiles/parent/dad/password"]')).not.toBeNull();
    });

    it('shows a locked parent PIN with password sign-in as the way back', async () => {
      const { harness, body, auth } = await open('/profiles/parent/dad');
      vi.spyOn(auth, 'parentPinSignIn').mockRejectedValue(
        problem(423, { title: 'Your parent PIN is locked.', state: 'locked', notified: true }),
      );

      type(harness, 'input[inputmode="numeric"]', '111224');
      await submit(harness);

      expect(text(body)).toContain('Your parent PIN is locked.');
      expect(text(body)).toContain('We’ve emailed you instructions.');
      expect(text(body)).toContain('Your account isn’t locked');
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await open('/profiles/parent/dad');

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  describe('a parent PIN reset link request', () => {
    it('says the link was emailed only when it was', async () => {
      const { body, harness } = await open('/profiles/parent/dad');
      const http = TestBed.inject(HttpTestingController);
      const button = () => [...body.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent!.includes('Email me a reset link'))!;

      button().click();
      const request = await vi.waitFor(() => http.expectOne('/api/device/parent-pin-reset'));
      expect(request.request.body).toEqual({ membershipId: 'dad' });
      request.flush({ notified: true }, { status: 202, statusText: 'Accepted' });
      await settle(harness);
      expect(body.querySelector('.reset [role="status"]')!.textContent).toContain('We’ve emailed you a reset link. It works once, for 15 minutes');

      button().click();
      (await vi.waitFor(() => http.expectOne('/api/device/parent-pin-reset'))).flush(
        { title: 'We sent a reset link recently.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
      await settle(harness);
      expect(body.querySelector('.reset [role="status"]')!.textContent).toContain('We sent you a reset link recently');

      button().click();
      (await vi.waitFor(() => http.expectOne('/api/device/parent-pin-reset'))).flush({ notified: false }, { status: 202, statusText: 'Accepted' });
      await settle(harness);
      expect(body.querySelector('.reset [role="status"]')!.textContent).toContain('We couldn’t send the email right now.');
    });
  });

  describe('a child’s own tablet', () => {
    it('goes straight to the child’s PIN, with no way back to a picker', async () => {
      const paired: DeviceProfiles = {
        familyName: 'Rivera Family',
        deviceKind: 'ChildPaired',
        profiles: [{ kind: 'child', id: 'kai', name: 'Kai', canSignIn: true, locked: false }],
      };
      const { body, router } = await open('/profiles', fakeAuth({ signedIn: false, device: paired }));

      expect(router.url).toBe('/profiles/child/kai');
      expect(body.querySelector('h1')!.textContent).toBe('Hi, Kai');
      expect(body.querySelector('a[href="/profiles"]')).toBeNull();
    });
  });

  describe('a parent using their password from the picker', () => {
    it('signs the parent in with their email and password', async () => {
      const { harness, body, auth, router } = await open('/profiles/parent/dad/password');
      const signIn = vi.spyOn(auth, 'signIn');

      expect(body.querySelector('h1')!.textContent).toBe('Hi, Dad');
      expect(body.querySelector('input[type="password"][autocomplete="current-password"]')).not.toBeNull();
      type(harness, 'input[type="email"]', 'dad@example.test');
      type(harness, 'input[type="password"]', 'correct horse battery staple');
      await submit(harness);

      expect(signIn).toHaveBeenCalledWith('dad@example.test', 'correct horse battery staple');
      expect(router.url).toBe('/');
    });
  });

  describe('a child tile', () => {
    it('signs the child in with their PIN and opens their space', async () => {
      const { harness, auth, router } = await open('/profiles/child/kai');
      const childSignIn = vi.spyOn(auth, 'childSignIn');

      type(harness, 'input[inputmode="numeric"]', '2580');
      await submit(harness);

      expect(childSignIn).toHaveBeenCalledWith('kai', '2580');
      expect(router.url).toBe('/kid');
    });

    it('accepts PINs of 4 to 6 digits only', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      const childSignIn = vi.spyOn(auth, 'childSignIn');

      type(harness, 'input[inputmode="numeric"]', '123');
      await submit(harness);

      expect(childSignIn).not.toHaveBeenCalled();
      expect(text(body)).toContain('Your PIN is 4 to 6 numbers.');
    });

    it('says how many tries are left after a wrong PIN', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      vi.spyOn(auth, 'childSignIn').mockRejectedValue(problem(401, { title: 'That PIN didn’t work.', triesLeft: 2 }));

      type(harness, 'input[inputmode="numeric"]', '1357');
      await submit(harness);

      expect(body.querySelector('[role="alert"]')!.textContent).toBe('That PIN didn’t work. 2 tries left.');
      // The box is empty and ready for the next try, without a second error under it.
      expect(body.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!.value).toBe('');
      expect(body.querySelector('mat-error')).toBeNull();
    });

    it('takes a friendly break after three wrong PINs, without mentioning email', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      vi.spyOn(auth, 'childSignIn').mockRejectedValue(
        problem(423, { title: 'Kai’s PIN is taking a short break.', state: 'paused', retryAt: '2099-01-01T10:10:00Z' }),
      );

      type(harness, 'input[inputmode="numeric"]', '1359');
      await submit(harness);

      expect(text(body)).toContain('Let’s take a short break.');
      expect(text(body)).toContain('Ask a parent for help');
      expect(text(body)).not.toContain('parents know');
      expect(body.querySelector('main form')).toBeNull();
    });

    it('locks calmly after more wrong PINs, saying the parents were told only when they were', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      const signIn = vi.spyOn(auth, 'childSignIn').mockRejectedValue(problem(423, { title: 'Kai’s PIN is locked.', state: 'locked', notified: true }));

      type(harness, 'input[inputmode="numeric"]', '1359');
      await submit(harness);

      expect(text(body)).toContain('Your PIN is locked.');
      expect(text(body)).toContain('We’ve let your parents know.');
      expect(body.querySelector('main form')).toBeNull();
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('doesn’t claim the parents were told when the email failed', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      vi.spyOn(auth, 'childSignIn').mockRejectedValue(problem(423, { title: 'Kai’s PIN is locked.', state: 'locked', notified: false }));

      type(harness, 'input[inputmode="numeric"]', '1359');
      await submit(harness);

      expect(text(body)).toContain('Your PIN is locked.');
      expect(text(body)).not.toContain('We’ve let your parents know.');
    });

    it('shows a PIN that is already locked or paused without asking for it', async () => {
      const { body } = await open('/profiles/child/kai', fakeAuth({ signedIn: false, device: lockedKai }));
      expect(text(body)).toContain('Your PIN is locked.');
      expect(body.querySelector('main form')).toBeNull();
      TestBed.resetTestingModule();

      const paused = await open('/profiles/child/kai', fakeAuth({ signedIn: false, device: pausedKai }));
      expect(text(paused.body)).toContain('Let’s take a short break.');
      expect(paused.body.querySelector('main form')).toBeNull();
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await open('/profiles/child/kai');

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  describe('pairing a child’s tablet', () => {
    it('redeems the code and opens the child’s PIN straight away', async () => {
      const { harness, auth, router } = await open('/pair', fakeAuth({ signedIn: false }));
      const pair = vi.spyOn(auth, 'pairDevice');

      type(harness, 'input[autocomplete="one-time-code"]', 'abcd-2345');
      type(harness, 'input[maxlength="60"]', 'Kai’s tablet');
      await submit(harness);

      expect(pair).toHaveBeenCalledWith('abcd-2345', 'Kai’s tablet');
      expect(router.url).toBe('/profiles/child/kai');
    });

    it('explains an expired or used code', async () => {
      const { harness, body, auth } = await open('/pair', fakeAuth({ signedIn: false }));
      vi.spyOn(auth, 'pairDevice').mockRejectedValue(problem(404, { title: 'That code didn’t work.' }));

      type(harness, 'input[autocomplete="one-time-code"]', 'ABCD2345');
      type(harness, 'input[maxlength="60"]', 'Kai’s tablet');
      await submit(harness);

      expect(body.querySelector('[role="alert"]')!.textContent).toContain('Codes work once and only for 10 minutes');
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await open('/pair', fakeAuth({ signedIn: false }));

      expect(await axeViolations(body)).toEqual([]);
    });
  });
});
