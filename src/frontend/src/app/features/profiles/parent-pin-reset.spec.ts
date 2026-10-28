import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { RESET_TOKEN_KEY } from './parent-pin-reset-page';

/** The parent PIN reset link (#153). Synthetic data only. */
describe('parent PIN reset link (#153)', () => {
  const CHECK = '/api/families/family-1/parent-pin/reset/check';
  const RESET = '/api/families/family-1/parent-pin/reset';

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  async function open(url: string, auth = fakeAuth()) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), auth],
    });
    const harness = await RouterTestingHarness.create(url);
    await settle(harness);
    return { harness, http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router), body: document.body };
  }

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  const text = () => document.body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  function type(harness: RouterTestingHarness, selector: string, value: string) {
    const input = document.body.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  it('takes the token out of the address bar and asks a signed-out visitor to sign in', async () => {
    const { router } = await open('/parent-pin/reset?token=abc123', fakeAuth({ signedIn: false }));

    expect(router.url).toBe('/parent-pin/reset');
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBe('abc123');
    expect(text()).toContain('Sign in with the email and password of the parent this link was sent to');
    expect(document.body.querySelector('a[href="/sign-in?returnUrl=%2Fparent-pin%2Freset"]')).not.toBeNull();
  });

  it('checks the link, then saves a new PIN after the password, using the link once', async () => {
    sessionStorage.setItem(RESET_TOKEN_KEY, 'abc123');
    const { harness, http } = await open('/parent-pin/reset');
    (await vi.waitFor(() => http.expectOne(CHECK))).flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);

    type(harness, 'input[autocomplete="current-password"]', 'correct horse battery staple');
    type(harness, 'input[formcontrolname="pin"]', '604918');
    type(harness, 'input[formcontrolname="confirm"]', '604918');
    document.body.querySelector<HTMLFormElement>('main form')!.dispatchEvent(new Event('submit'));
    const save = await vi.waitFor(() => http.expectOne(RESET));
    expect(save.request.body).toEqual({ token: 'abc123', currentPassword: 'correct horse battery staple', pin: '604918' });
    save.flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);

    expect(text()).toContain('Your new parent PIN works now.');
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBeNull();
  });

  it('explains an expired or used link the same way', async () => {
    sessionStorage.setItem(RESET_TOKEN_KEY, 'old');
    const { harness, http } = await open('/parent-pin/reset');
    (await vi.waitFor(() => http.expectOne(CHECK))).flush({ title: 'Gone' }, { status: 410, statusText: 'Gone' });
    await settle(harness);

    expect(document.body.querySelector('[role="alert"]')!.textContent).toContain('expired or was already used');
    expect(document.body.querySelector('main form')).toBeNull();
  });

  it('tells the other parent to use the account the link was sent to, without naming it', async () => {
    sessionStorage.setItem(RESET_TOKEN_KEY, 'abc123');
    const { harness, http } = await open('/parent-pin/reset');
    (await vi.waitFor(() => http.expectOne(CHECK))).flush({ title: 'Wrong' }, { status: 403, statusText: 'Forbidden' });
    await settle(harness);

    expect(document.body.querySelector('[role="alert"]')!.textContent).toBe('Use the parent account this reset link was sent to.');
    expect(text()).toContain('Switch account');
  });

  it('has no automatically detectable accessibility issues on the form', async () => {
    sessionStorage.setItem(RESET_TOKEN_KEY, 'abc123');
    const { harness, http } = await open('/parent-pin/reset');
    (await vi.waitFor(() => http.expectOne(CHECK))).flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);

    expect(await axeViolations(document.body)).toEqual([]);
  });
});
