import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthStore } from '../../core/auth/auth.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';

// Synthetic family only.
const F = '/api/families/family-1';
const ALEX = { membershipId: 'm-alex', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '2026-10-01T12:00:00Z' };
const SAM = { membershipId: 'm-sam', displayName: 'Sam Rivera', role: 'Parent', joinedAt: '2026-10-02T12:00:00Z' };
const family = (members: object[]) => ({ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T12:00:00Z', members });

describe('delete account (A-12)', () => {
  let http: HttpTestingController;

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function settings(members: object[]) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    const harness = await RouterTestingHarness.create('/settings');
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(`${F}/devices`), { timeout: 2000 }).then((r) => r.flush([]));
    for (const r of http.match(`${F}/children`)) r.flush([]);
    for (const r of http.match('/api/me/families')) r.flush([{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }]);
    for (const r of http.match(F)) r.flush(family(members));
    for (const r of http.match(`${F}/invitations`)) r.flush([]);
    await settle(harness);
    return { harness, body: document.body };
  }

  const section = (body: HTMLElement) => body.querySelector<HTMLElement>('app-delete-account')!;
  const text = (element: HTMLElement) => element.textContent!.replace(/\s+/g, ' ');

  function click(within: HTMLElement, label: string) {
    const match = [...within.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent!.trim() === label);
    if (!match) {
      throw new Error(`No button "${label}"`);
    }
    match.click();
  }

  async function begin(harness: RouterTestingHarness, body: HTMLElement) {
    click(section(body), 'Delete account…');
    await settle(harness);
  }

  async function submit(harness: RouterTestingHarness, body: HTMLElement, password: string) {
    const input = section(body).querySelector<HTMLInputElement>('input[type=password]')!;
    input.value = password;
    input.dispatchEvent(new Event('input'));
    section(body).querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(harness);
  }

  it('explains that the family stays with the co-parent and doesn’t name them in the notice', async () => {
    const { harness, body } = await settings([ALEX, SAM]);

    expect(text(section(body))).toContain('Permanently delete your Parenthesis account');
    await begin(harness, body);

    const explanation = text(section(body));
    expect(explanation).toContain('This can\'t be undone.');
    expect(explanation).toContain('Leaves Rivera Family with Sam Rivera');
    expect(explanation).toContain('“Former parent”');
    expect(explanation).toContain('It doesn\'t include your name.');
    expect(document.activeElement?.classList.contains('warning')).toBe(true);
  });

  it('explains that an only parent’s family is deleted too', async () => {
    const { harness, body } = await settings([ALEX]);
    await begin(harness, body);

    expect(text(section(body))).toContain('Deletes Rivera Family too, because you\'re its only parent');
  });

  it('needs the password, then signs out and confirms on the sign-in page', async () => {
    const { harness, body } = await settings([ALEX, SAM]);
    const store = TestBed.inject(AuthStore);
    const remove = vi.spyOn(store, 'deleteAccount');
    await begin(harness, body);

    await submit(harness, body, '');
    expect(remove).not.toHaveBeenCalled();
    expect(text(section(body))).toContain('Enter your password.');

    await submit(harness, body, 'correct horse battery staple');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/sign-in?accountDeleted=1'));
    await settle(harness);

    expect(remove).toHaveBeenCalledWith('correct horse battery staple');
    expect(text(body.querySelector('[role=status]')!)).toContain('Your account has been deleted.');
  });

  it('shows a wrong password on the field and deletes nothing', async () => {
    const { harness, body } = await settings([ALEX, SAM]);
    const store = TestBed.inject(AuthStore) as unknown as { deleteAccount: () => Promise<void> };
    store.deleteAccount = () =>
      Promise.reject(new HttpErrorResponse({ status: 400, error: { errors: { password: ['That password isn\'t right.'] } } }));
    await begin(harness, body);

    await submit(harness, body, 'not my password');

    expect(text(section(body))).toContain('That password isn\'t right.');
    expect(TestBed.inject(Router).url).toBe('/settings');
  });

  it('cancels back to the closed state', async () => {
    const { harness, body } = await settings([ALEX, SAM]);
    await begin(harness, body);

    click(section(body), 'Cancel');
    await settle(harness);

    expect(section(body).querySelector('input')).toBeNull();
  });

  it('has no axe violations while confirming', async () => {
    const { harness, body } = await settings([ALEX, SAM]);
    await begin(harness, body);

    expect(await axeViolations(body)).toEqual([]);
  });
});
