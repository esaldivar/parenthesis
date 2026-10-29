import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ChangeRequest, Child, Device, DeviceProfiles } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { isGuessablePin } from './children-access';
import { toastText } from '../../../testing/toasts';

// Synthetic family only.
const F = '/api/families/family-1';
const KAI: Child = {
  id: 'kai',
  firstName: 'Kai',
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: true, locked: false, pinChangePending: false },
};
const AURORA: Child = {
  id: 'aurora',
  firstName: 'Aurora',
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: false, locked: false, pinChangePending: false },
};
const MILO: Child = { ...AURORA, id: 'milo', firstName: 'Milo', status: 'PendingApproval' };
const DEVICES: Device[] = [
  { id: 'd1', name: 'Kitchen iPad', kind: 'Household', childProfileId: null, createdAt: '2026-10-01T12:00:00Z', lastSeenAt: '2026-10-18T12:00:00Z', expiresAt: '2026-10-31T12:00:00Z' },
  { id: 'd2', name: 'Kai’s tablet', kind: 'ChildPaired', childProfileId: 'kai', createdAt: '2026-10-02T12:00:00Z', lastSeenAt: '2026-10-17T12:00:00Z' },
];
const FAMILY = {
  id: 'family-1',
  name: 'Rivera Family',
  timeZone: 'America/Chicago',
  createdAt: '2026-10-01T12:00:00Z',
  members: [
    { membershipId: 'm-alex', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '2026-10-01T12:00:00Z' },
    { membershipId: 'm-sam', displayName: 'Sam Rivera', role: 'Parent', joinedAt: '2026-10-02T12:00:00Z' },
  ],
};
const PICKER: DeviceProfiles = { familyName: 'Rivera Family', deviceKind: 'Household', profiles: [], isYours: true };

function request(overrides: Partial<ChangeRequest>): ChangeRequest {
  return {
    id: 'r1',
    type: 'ChildCreate',
    targetType: 'child',
    targetId: 'milo',
    summary: 'Add Milo to the family',
    reason: null,
    status: 'Pending',
    proposerMembershipId: 'm-sam',
    createdAt: '2026-10-18T12:00:00Z',
    approvals: 1,
    requiredApprovals: 2,
    canDecide: true,
    proposedByYou: false,
    resolvedAt: null,
    decisions: [],
    ...overrides,
  };
}

describe('children’s sign-in, devices and approvals (Design Request #1, part B)', () => {
  let http: HttpTestingController;

  async function open(url: string, auth = fakeAuth()) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), auth],
    });
    const harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    return { harness, body: document.body };
  }

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  /** Answers every outstanding request for each URL (pages may ask twice, for example for the children). */
  async function answer(harness: RouterTestingHarness, responses: Record<string, object>) {
    for (const [url, body] of Object.entries(responses)) {
      const pending = await vi.waitFor(() => {
        const found = http.match(url);
        expect(found.length).toBeGreaterThan(0);
        return found;
      });
      for (const request of pending) {
        request.flush(body);
      }
    }
    await settle(harness);
  }

  /** The settings page's first load. */
  async function settings(children: Child[] = [KAI, AURORA, MILO], auth = fakeAuth(), devices: Device[] = DEVICES) {
    const opened = await open('/settings', auth);
    await vi.waitFor(() => http.expectOne(`${F}/devices`), { timeout: 2000 }).then((r) => r.flush(devices));
    for (const r of http.match(`${F}/children`)) r.flush(children);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/invitations`)) r.flush([]);
    for (const r of http.match(`${F}/parent-pin`)) r.flush({ isSet: true, locked: false, pausedUntil: null });
    await settle(opened.harness);
    return opened;
  }

  /** The text of `selector` inside `element`; the page's main area for the body, else the element itself. */
  const text = (element: HTMLElement, selector = element === document.body ? 'main' : undefined) =>
    (selector ? element.querySelector(selector)! : element).textContent!.replace(/\s+/g, ' ');

  function click(body: HTMLElement, label: string, within = 'main') {
    const match = [...body.querySelectorAll<HTMLElement>(`${within} button, ${within} a`)].find((b) => b.textContent!.trim() === label);
    if (!match) {
      throw new Error(`No button "${label}"`);
    }
    match.click();
  }

  function type(harness: RouterTestingHarness, input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  const childItem = (body: HTMLElement, name: string) =>
    [...body.querySelectorAll<HTMLElement>('app-children-access .child')].find((li) => li.textContent!.includes(name))!;

  describe('children', () => {
    it('shows each child’s sign-in state and offers only the actions that apply', async () => {
      const { body } = await settings();

      expect(text(childItem(body, 'Kai'), '.child__state')).toBe('Signs in with a PIN');
      expect(text(childItem(body, 'Aurora'), '.child__state')).toBe('No PIN yet, so can’t sign in');
      expect(text(childItem(body, 'Milo'), '.child__state')).toBe('Waiting for approval');
      expect(text(childItem(body, 'Kai'), '.child__actions')).toContain('Reset PIN');
      expect(text(childItem(body, 'Aurora'), '.child__actions')).toBe(' Set a PIN ');
      expect(childItem(body, 'Milo').querySelector('.child__actions')).toBeNull();
    });

    it('sets a first PIN at once', async () => {
      const { harness, body } = await settings();
      click(childItem(body, 'Aurora'), 'Set a PIN', '.child');
      harness.fixture.detectChanges();
      const [pin, confirm] = childItem(body, 'Aurora').querySelectorAll('input');
      type(harness, pin, '4826');
      type(harness, confirm, '4826');
      click(childItem(body, 'Aurora'), 'Save PIN', '.child');

      const put = await vi.waitFor(() => http.expectOne(`${F}/children/aurora/pin`));
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ pin: '4826' });
      put.flush(null, { status: 204, statusText: 'No Content' });
      await answer(harness, { [`${F}/children`]: [KAI, { ...AURORA, signIn: { ...AURORA.signIn, enabled: true } }, MILO] });

      expect(toastText()).toContain('Aurora can now sign in with their PIN.');
    });

    it('resets a PIN at once, without the co-parent’s approval (#153)', async () => {
      const { harness, body } = await settings();
      click(childItem(body, 'Kai'), 'Reset PIN', '.child');
      harness.fixture.detectChanges();
      expect(text(childItem(body, 'Kai'))).toContain('works straight away and clears any pause or lock');
      const [pin, confirm] = childItem(body, 'Kai').querySelectorAll('input');
      type(harness, pin, '4826');
      type(harness, confirm, '4826');
      click(childItem(body, 'Kai'), 'Reset PIN now', '.child');

      const put = await vi.waitFor(() => http.expectOne(`${F}/children/kai/pin`));
      expect(put.request.method).toBe('PUT');
      put.flush(null, { status: 204, statusText: 'No Content' });
      await answer(harness, { [`${F}/children`]: [KAI, AURORA, MILO] });

      expect(toastText()).toContain('Kai’s new PIN works now.');
    });

    it('refuses easy-to-guess and mismatched PINs before asking the API', async () => {
      const { harness, body } = await settings();
      click(childItem(body, 'Aurora'), 'Set a PIN', '.child');
      harness.fixture.detectChanges();
      const [pin, confirm] = childItem(body, 'Aurora').querySelectorAll('input');
      type(harness, pin, '1234');
      type(harness, confirm, '4321');
      click(childItem(body, 'Aurora'), 'Save PIN', '.child');
      harness.fixture.detectChanges();

      expect(text(childItem(body, 'Aurora'))).toContain('aren’t all the same or in a simple run');
      expect(text(childItem(body, 'Aurora'))).toContain('The two PINs don’t match.');
      http.expectNone(`${F}/children/aurora/pin`);
    });

    it('shows a locked or paused PIN, and offers a reset rather than a one-tap unlock', async () => {
      const paused = new Date(Date.now() + 5 * 60_000).toISOString();
      const { body } = await settings([
        { ...KAI, signIn: { ...KAI.signIn, locked: true } },
        { ...AURORA, signIn: { ...AURORA.signIn, enabled: true, pausedUntil: paused } },
      ]);

      expect(text(childItem(body, 'Kai'), '.child__state')).toBe('PIN locked after too many wrong tries: choose a new PIN');
      expect(text(childItem(body, 'Aurora'), '.child__state')).toBe('PIN paused for a few minutes after 3 wrong tries');
      expect(text(childItem(body, 'Kai'), '.child__actions')).toContain('Reset PIN');
      expect(text(childItem(body, 'Kai'), '.child__actions')).not.toContain('Unlock');
    });

    it('turns sign-in off only after explaining what happens', async () => {
      const { harness, body } = await settings();
      click(childItem(body, 'Kai'), 'Turn off sign-in', '.child');
      harness.fixture.detectChanges();
      http.expectNone(`${F}/children/kai/pin`);
      expect(text(childItem(body, 'Kai'))).toContain('signed out now');

      click(childItem(body, 'Kai'), 'Turn off sign-in', '.panel');
      const off = await vi.waitFor(() => http.expectOne(`${F}/children/kai/pin`));
      expect(off.request.method).toBe('DELETE');
      off.flush(null, { status: 204, statusText: 'No Content' });
      await answer(harness, { [`${F}/children`]: [KAI] });
    });

    it('shows a single-use pairing code for a child’s tablet, read out one character at a time', async () => {
      const { harness, body } = await settings();
      click(childItem(body, 'Kai'), 'Pair a tablet', '.child');
      harness.fixture.detectChanges();
      click(childItem(body, 'Kai'), 'Get a code', '.child');

      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      (await vi.waitFor(() => http.expectOne(`${F}/children/kai/pairing-code`))).flush({ code: 'ABCD-2345', expiresAt });
      await settle(harness);

      const code = childItem(body, 'Kai').querySelector('.code')!;
      expect(code.textContent).toBe('ABCD-2345');
      expect(code.getAttribute('aria-label')).toBe('A B C D, 2 3 4 5');
      expect(text(childItem(body, 'Kai'))).toContain('about 10 more minutes');
      expect(text(childItem(body, 'Kai'))).toContain('/pair');
    });
  });

  describe('devices', () => {
    it('lists the family’s devices, and removes one only after confirming', async () => {
      const { harness, body } = await settings();
      const list = () => text(body, 'app-device-list');
      expect(list()).toContain('Kitchen iPad');
      expect(list()).toContain('Kai’s own device');

      body.querySelector<HTMLButtonElement>('app-device-list button[aria-label="Remove Kitchen iPad"]')!.click();
      harness.fixture.detectChanges();
      http.expectNone(`${F}/devices/d1`);
      click(body, 'Remove device', 'app-device-list');

      const remove = await vi.waitFor(() => http.expectOne(`${F}/devices/d1`));
      expect(remove.request.method).toBe('DELETE');
      remove.flush(null, { status: 204, statusText: 'No Content' });
      await answer(harness, { [`${F}/devices`]: [DEVICES[1]], [`${F}/children`]: [KAI] });

      expect(toastText()).toContain('Kitchen iPad was removed.');
    });

    it('marks this browser’s shared device and stops sharing it only after confirming, then signs out', async () => {
      const auth = fakeAuth({ device: PICKER });
      const here = [{ ...DEVICES[0], isThisDevice: true }, DEVICES[1]];
      const { harness, body } = await settings([KAI], auth, here);
      const store = TestBed.inject(AuthStore);
      const signOut = vi.spyOn(store, 'signOut');
      expect(text(body, 'app-device-list')).toContain('Kitchen iPad (this device)');
      expect(body.querySelector('app-device-list button[aria-label="Remove Kitchen iPad"]')).toBeNull();

      click(body, 'Stop sharing this device', 'app-device-list');
      harness.fixture.detectChanges();
      expect(text(body, 'app-device-list')).toContain('including you, is signed out');
      http.expectNone(`${F}/devices/d1`);
      click(body, 'Stop sharing', 'app-device-list');

      const remove = await vi.waitFor(() => http.expectOne(`${F}/devices/d1`));
      expect(remove.request.method).toBe('DELETE');
      remove.flush(null, { status: 204, statusText: 'No Content' });
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/sign-in'));

      expect(signOut).toHaveBeenCalled();
      expect(toastText()).toContain('This device is no longer shared.');
    });

    it('offers Switch profile on this browser’s shared device, returning to the picker (#372)', async () => {
      const auth = fakeAuth({ device: PICKER });
      const here = [{ ...DEVICES[0], isThisDevice: true }, DEVICES[1]];
      const { body } = await settings([KAI], auth, here);
      const switchProfile = vi.spyOn(TestBed.inject(AuthStore), 'switchProfile');

      click(body, 'Switch profile', 'app-device-list');

      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/profiles'));
      expect(switchProfile).toHaveBeenCalled();
    });

    it('keeps the ordinary Remove for a child’s paired tablet a parent is signed in on', async () => {
      const { body } = await settings([KAI], fakeAuth(), [DEVICES[0], { ...DEVICES[1], isThisDevice: true }]);

      expect(text(body, 'app-device-list')).toContain('Kai’s tablet (this device)');
      expect(body.querySelector('app-device-list button[aria-label="Remove Kai’s tablet"]')).not.toBeNull();
      expect(text(body, 'app-device-list')).not.toContain('Stop sharing this device');
    });

    it('keeps the parent signed in when stopping sharing fails', async () => {
      const auth = fakeAuth({ device: PICKER });
      const { harness, body } = await settings([KAI], auth, [{ ...DEVICES[0], isThisDevice: true }]);
      const signOut = vi.spyOn(TestBed.inject(AuthStore), 'signOut');

      click(body, 'Stop sharing this device', 'app-device-list');
      harness.fixture.detectChanges();
      click(body, 'Stop sharing', 'app-device-list');
      const remove = await vi.waitFor(() => http.expectOne(`${F}/devices/d1`));
      remove.flush({ title: 'Something went wrong' }, { status: 500, statusText: 'Server Error' });
      await settle(harness);

      expect(signOut).not.toHaveBeenCalled();
      expect(body.querySelector('app-device-list [role="alert"]')).not.toBeNull();
    });

    it('offers explicit shared-device setup when this browser isn’t the parent’s shared device', async () => {
      const { body } = await settings();

      const link = body.querySelector<HTMLAnchorElement>('app-device-list a')!;
      expect(link.textContent!.trim()).toBe('Set up this device for sharing');
      expect(link.getAttribute('href')).toBe('/shared-device/setup?returnUrl=%2Fsettings');
      http.expectNone(`${F}/devices/household`);
    });

    it('doesn’t offer it again on the parent’s own shared device', async () => {
      const { body } = await settings([KAI], fakeAuth({ device: PICKER }));

      expect(text(body, 'app-device-list')).not.toContain('Set up this device for sharing');
    });

    it('shows when a shared device’s sharing ends', async () => {
      const { body } = await settings();

      expect(text(body, 'app-device-list')).toContain('Sharing ends');
    });

    it('has no automatically detectable accessibility issues in settings', async () => {
      const { body } = await settings();

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  describe('approvals', () => {
    async function approvals(pending: ChangeRequest[], history: ChangeRequest[] = []) {
      const opened = await open('/approvals');
      const lists = await vi.waitFor(() => {
        const found = http.match((r) => r.url === `${F}/approvals`);
        expect(found.length).toBe(2);
        return found;
      });
      for (const list of lists) {
        list.flush(list.request.params.get('view') === 'history' ? history : pending);
      }
      await answer(opened.harness, { [F]: FAMILY, [`${F}/children`]: [KAI, MILO] });
      return opened;
    }

    const item = (body: HTMLElement, section: string, summary: string) =>
      [...body.querySelectorAll<HTMLElement>(`section[aria-labelledby="${section}"] .request`)].find((li) =>
        li.textContent!.includes(summary),
      )!;

    it('shows a waiting request as a proposal, with who asked and what happens once both agree', async () => {
      const { body } = await approvals([request({})]);
      const milo = item(body, 'waiting-heading', 'Add Milo to the family');

      expect(text(milo)).toContain('Waiting for you');
      expect(text(milo)).toContain('Proposed by Sam Rivera');
      expect(text(milo)).toContain('1 of 2 approvals');
      expect(text(milo)).toContain('Milo can start using Parenthesis once you both approve.');
    });

    it('approves', async () => {
      const { harness, body } = await approvals([request({})]);
      click(item(body, 'waiting-heading', 'Add Milo'), 'Approve', '.request');

      const approve = await vi.waitFor(() => http.expectOne(`${F}/approvals/r1/approve`));
      approve.flush(request({ status: 'Approved' }));
      await vi.waitFor(() => expect(http.match((r) => r.url === `${F}/approvals`).length).toBe(2));
      for (const list of http.match((r) => r.url === `${F}/approvals`)) list.flush([]);
      await answer(harness, { [F]: FAMILY, [`${F}/children`]: [KAI] });

      expect(toastText()).toContain('You approved “Add Milo to the family”.');
    });

    it('declines with an optional note for the co-parent', async () => {
      const { harness, body } = await approvals([request({})]);
      click(item(body, 'waiting-heading', 'Add Milo'), 'Decline', '.request');
      harness.fixture.detectChanges();
      type(harness, item(body, 'waiting-heading', 'Add Milo').querySelector('textarea')!, 'Let’s talk first.');
      click(item(body, 'waiting-heading', 'Add Milo'), 'Decline', '.panel');

      const reject = await vi.waitFor(() => http.expectOne(`${F}/approvals/r1/reject`));
      expect(reject.request.body).toEqual({ comment: 'Let’s talk first.' });
      reject.flush(request({ status: 'Rejected' }));
    });

    it('lets the proposer withdraw, and never decide, their own request', async () => {
      const { body } = await approvals([
        request({ type: 'ChildPinChange', targetId: 'kai', summary: "Change Kai's PIN", canDecide: false, proposedByYou: true, proposerMembershipId: 'm-alex' }),
      ]);
      const kai = item(body, 'waiting-heading', "Change Kai's PIN");

      expect(text(kai)).toContain('Waiting for your co-parent');
      expect(text(kai)).toContain('Proposed by you');
      expect(text(kai)).toContain('Kai’s current PIN keeps working');
      expect(text(kai)).not.toContain('Approve');
      click(kai, 'Withdraw', '.request');
      (await vi.waitFor(() => http.expectOne(`${F}/approvals/r1/withdraw`))).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('lists decisions with their notes, and shows calendar requests with what they mean', async () => {
      const { body } = await approvals(
        [request({ id: 'cal', type: 'CalendarCreate', targetType: 'calendar_event', summary: 'Parenting time with Sam' })],
        [
          request({
            status: 'Rejected',
            canDecide: false,
            resolvedAt: '2026-10-18T13:00:00Z',
            decisions: [{ deciderMembershipId: 'm-alex', decision: 'Reject', comment: 'Let’s talk first.', decidedAt: '2026-10-18T13:00:00Z' }],
          }),
        ],
      );

      const waiting = text(body, 'section[aria-labelledby="waiting-heading"]');
      expect(waiting).toContain('Parenting time with Sam');
      expect(waiting).toContain('It goes on the shared calendar once you both approve.');
      const decided = item(body, 'history-heading', 'Add Milo');
      expect(text(decided)).toContain('Declined');
      expect(text(decided)).toContain('Alex Rivera: “Let’s talk first.”');
    });

    it('says a repeating parenting-time request answers every date at once (#239)', async () => {
      const { body } = await approvals([
        request({
          id: 'series',
          type: 'CalendarCreate',
          targetType: 'calendar_series',
          summary: 'Add: Time with Sam, every 2 weeks, 6 dates from Oct 21 to Dec 30',
        }),
      ]);

      const waiting = text(body, 'section[aria-labelledby="waiting-heading"]');
      expect(waiting).toContain('Add: Time with Sam, every 2 weeks, 6 dates from Oct 21 to Dec 30');
      expect(waiting).toContain('Every date goes on the shared calendar once you both approve. Approving or declining answers them all.');
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { body } = await approvals([request({})]);

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  it('recognises easy-to-guess PINs the same way the API does', () => {
    expect(['1111', '1234', '98765', '000000'].map(isGuessablePin)).toEqual([true, true, true, true]);
    expect(['2580', '1357', '4826', '112233'].map(isGuessablePin)).toEqual([false, false, false, false]);
  });
});
