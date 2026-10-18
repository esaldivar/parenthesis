import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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

function problem(status: number, body: object): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('profile picker, parent password and child PIN (ADR-0006)', () => {
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

    it('marks a locked profile', async () => {
      const { body } = await open('/profiles', fakeAuth({ signedIn: false, device: lockedKai }));

      expect(body.querySelector('.tiles a[href="/profiles/child/kai"]')!.textContent).toContain('Locked');
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
    it('asks for the full password and signs the parent in', async () => {
      const { harness, body, auth, router } = await open('/profiles/parent/dad');
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
    });

    it('locks calmly after the third wrong PIN, saying the parents have been told', async () => {
      const { harness, body, auth } = await open('/profiles/child/kai');
      vi.spyOn(auth, 'childSignIn').mockRejectedValue(problem(423, { title: 'Kai’s profile is locked.' }));

      type(harness, 'input[inputmode="numeric"]', '1359');
      await submit(harness);

      expect(text(body)).toContain('Your profile is locked.');
      expect(text(body)).toContain('We’ve let your parents know.');
      expect(body.querySelector('main form')).toBeNull();
    });

    it('shows a profile that is already locked without asking for the PIN', async () => {
      const { body } = await open('/profiles/child/kai', fakeAuth({ signedIn: false, device: lockedKai }));

      expect(text(body)).toContain('Your profile is locked.');
      expect(body.querySelector('main form')).toBeNull();
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await open('/profiles/child/kai');

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  describe('pairing a child’s tablet', () => {
    it('redeems the code and opens the child’s picker', async () => {
      const { harness, auth, router } = await open('/pair', fakeAuth({ signedIn: false }));
      const pair = vi.spyOn(auth, 'pairDevice');

      type(harness, 'input[autocomplete="one-time-code"]', 'abcd-2345');
      type(harness, 'input[maxlength="60"]', 'Kai’s tablet');
      await submit(harness);

      expect(pair).toHaveBeenCalledWith('abcd-2345', 'Kai’s tablet');
      expect(router.url).toBe('/profiles');
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
