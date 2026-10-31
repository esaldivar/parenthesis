import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';

// Synthetic people only.
const KAI = { childId: 'kai', firstName: 'Kai', familyId: 'family-1' };

describe('Privacy notice (#416)', () => {
  async function open(url: string, auth = fakeAuth({ signedIn: false })) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        auth,
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
    return { harness, body: document.body, router: TestBed.inject(Router) };
  }

  const text = (body: HTMLElement) => body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  it('opens without signing in', async () => {
    const { body, router } = await open('/privacy');

    expect(router.url).toBe('/privacy');
    expect(body.querySelector('h1')!.textContent).toBe('Privacy notice');
    expect(text(body)).toContain('privacy@parenthesisfamily.com');
    expect(await axeViolations(body)).toEqual([]);
  });

  it.each([
    ['a signed-in parent', fakeAuth()],
    ['a signed-in child', fakeAuth({ child: KAI })],
  ])('opens for %s too', async (_who, auth) => {
    const { router, body } = await open('/privacy', auth);

    expect(router.url).toBe('/privacy');
    expect(body.querySelector('h1')!.textContent).toBe('Privacy notice');
  });

  it('covers collection, children, sharing, storage, retention, rights and contact', async () => {
    const { body } = await open('/privacy');
    const headings = [...body.querySelectorAll('main h2')].map((h) => h.textContent!.trim());

    expect(headings).toEqual([
      'On this page',
      'Who we are',
      'What we collect',
      'Children’s information',
      'How we use information',
      'Who we share it with',
      'Cookies and browser storage',
      'How long we keep it',
      'Your choices and rights',
      'How we protect it',
      'Changes to this notice',
      'Contact',
    ]);
    for (const service of [
      'Microsoft Azure',
      'Brevo',
      'Google Places',
      'Google Calendar',
      'Google Maps',
    ]) {
      expect(text(body)).toContain(service);
    }
    expect(text(body)).toContain('__Host-parenthesis-device');
  });

  it('links every contents entry to a heading on the page', async () => {
    const { body } = await open('/privacy');
    const targets = [...body.querySelectorAll<HTMLAnchorElement>('nav a')].map(
      (a) => a.getAttribute('href')!.split('#')[1],
    );

    expect(targets.length).toBe(11);
    for (const id of targets) {
      expect(body.querySelector(`h2#${id}`), id).not.toBeNull();
    }
  });

  it('links to the notice from the sign-in footer, marking it current on the notice itself', async () => {
    const signIn = await open('/sign-in');
    const link = signIn.body.querySelector<HTMLAnchorElement>('footer a')!;

    expect(link.textContent!.trim()).toBe('Privacy');
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(link.getAttribute('aria-current')).toBeNull();

    TestBed.resetTestingModule();
    const notice = await open('/privacy');
    expect(notice.body.querySelector('footer a')!.getAttribute('aria-current')).toBe('page');
    expect(notice.body.querySelector('header a')!.getAttribute('href')).toBe('/');
  });

  it('links to the notice from parent Settings', async () => {
    const { body } = await open('/settings', fakeAuth());
    const link = [...body.querySelectorAll<HTMLAnchorElement>('main a')].find(
      (a) => a.textContent!.trim() === 'Read the privacy notice',
    );

    expect(link?.getAttribute('href')).toBe('/privacy');
  });

  it('links to the notice from the kids’ Settings', async () => {
    const { body } = await open('/kid/settings', fakeAuth({ child: KAI }));
    const link = [...body.querySelectorAll<HTMLAnchorElement>('main a')].find(
      (a) => a.textContent!.trim() === 'Privacy',
    );

    expect(link?.getAttribute('href')).toBe('/privacy');
  });
});
