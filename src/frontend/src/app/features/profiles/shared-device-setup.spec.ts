import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthStore } from '../../core/auth/auth.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';

/** "Is this a shared family device?" (#153). Synthetic data only. */
describe('shared-device setup (#153)', () => {
  async function open(url = '/shared-device/setup?returnUrl=%2Fcalendar', pinIsSet = false) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    const harness = await RouterTestingHarness.create(url);
    const http = TestBed.inject(HttpTestingController);
    for (const r of http.match('/api/families/family-1/parent-pin')) {
      r.flush({ isSet: pinIsSet, locked: false, pausedUntil: null });
    }
    await settle(harness);
    return { harness, http, body: document.body, auth: TestBed.inject(AuthStore), router: TestBed.inject(Router) };
  }

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  const text = () => document.body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  function click(label: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent!.trim() === label);
    if (!button) {
      throw new Error(`No button "${label}"`);
    }
    button.click();
  }

  function type(harness: RouterTestingHarness, selector: string, value: string) {
    const input = document.body.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  it('asks the question and explains what sharing means, including the 30 days', async () => {
    await open();

    expect(document.body.querySelector('h1')!.textContent).toBe('Is this a shared family device?');
    expect(text()).toContain('Only you and your approved children appear');
    expect(text()).toContain('Sharing lasts 30 days');
    expect(text()).toContain('Don’t choose this on a public, work or borrowed device.');
  });

  it('“No” registers nothing and continues to where the parent was heading', async () => {
    const { harness, auth, router } = await open();
    const setUp = vi.spyOn(auth, 'setUpSharedDevice');

    click('No, continue to my account');
    await settle(harness);

    expect(setUp).not.toHaveBeenCalled();
    expect(router.url).toBe('/calendar');
  });

  it('“Yes” creates the parent PIN with the device and continues without another password prompt', async () => {
    const { harness, auth, router } = await open();
    const setUp = vi.spyOn(auth, 'setUpSharedDevice');

    click('Yes, set up sharing');
    harness.fixture.detectChanges();
    type(harness, 'input[formcontrolname="name"]', 'Kitchen iPad');
    type(harness, 'input[formcontrolname="pin"]', '583920');
    type(harness, 'input[formcontrolname="confirm"]', '583920');
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    await settle(harness);

    expect(setUp).toHaveBeenCalledWith('family-1', 'Kitchen iPad', '583920');
    expect(router.url).toBe('/calendar');
    expect(document.body.querySelector('input[type="password"][autocomplete="current-password"]')).toBeNull();
  });

  it('doesn’t ask for a PIN again when the parent already has one', async () => {
    const { harness, auth } = await open(undefined, true);
    const setUp = vi.spyOn(auth, 'setUpSharedDevice');

    click('Yes, set up sharing');
    harness.fixture.detectChanges();
    expect(document.body.querySelector('input[formcontrolname="pin"]')).toBeNull();
    type(harness, 'input[formcontrolname="name"]', 'Family laptop');
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    await settle(harness);

    expect(setUp).toHaveBeenCalledWith('family-1', 'Family laptop', null);
  });

  it('refuses easy-to-guess and mismatched PINs before asking the API', async () => {
    const { harness, auth } = await open();
    const setUp = vi.spyOn(auth, 'setUpSharedDevice');

    click('Yes, set up sharing');
    harness.fixture.detectChanges();
    type(harness, 'input[formcontrolname="name"]', 'Kitchen iPad');
    type(harness, 'input[formcontrolname="pin"]', '123456');
    type(harness, 'input[formcontrolname="confirm"]', '654321');
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    await settle(harness);

    expect(setUp).not.toHaveBeenCalled();
    expect(text()).toContain('aren’t all the same or in a simple run');
    expect(text()).toContain('The two PINs don’t match.');
  });

  it('never claims sharing is on when setup fails, and lets the parent continue privately', async () => {
    const { harness, auth, router } = await open();
    vi.spyOn(auth, 'setUpSharedDevice').mockRejectedValue(new HttpErrorResponse({ status: 0 }));

    click('Yes, set up sharing');
    harness.fixture.detectChanges();
    type(harness, 'input[formcontrolname="name"]', 'Kitchen iPad');
    type(harness, 'input[formcontrolname="pin"]', '583920');
    type(harness, 'input[formcontrolname="confirm"]', '583920');
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    await settle(harness);

    expect(document.body.querySelector('[role="alert"]')!.textContent).toContain('We couldn’t set up sharing. Try again.');
    expect(router.url).toBe('/shared-device/setup?returnUrl=%2Fcalendar');
    expect(text()).toContain('No, continue to my account');
  });

  it('ignores a return URL that leaves the app', async () => {
    const { harness, router } = await open('/shared-device/setup?returnUrl=%2F%2Fevil.example');

    click('No, continue to my account');
    await settle(harness);

    expect(router.url).toBe('/');
  });

  it('has no automatically detectable accessibility issues, with the PIN form open', async () => {
    const { harness } = await open();
    click('Yes, set up sharing');
    harness.fixture.detectChanges();

    expect(await axeViolations(document.body)).toEqual([]);
  });
});
