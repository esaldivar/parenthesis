import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { FamilySummary } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';

// Synthetic data only.
const FAMILY: FamilySummary = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' };
const PENDING_KEY = 'parenthesis.pendingInvitation';

describe('sign-up, household setup and invitations (Design Request #1)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  async function open(url: string, auth = fakeAuth()) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), auth],
    });
    const harness = await RouterTestingHarness.create(url);
    return { harness, http: TestBed.inject(HttpTestingController), body: document.body };
  }

  const routerOf = (harness: RouterTestingHarness) => harness.fixture.debugElement.injector.get(Router);
  const text = (body: HTMLElement) => body.querySelector('main')!.textContent!.replace(/\s+/g, ' ');

  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  function type(harness: RouterTestingHarness, element: HTMLInputElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  function button(body: HTMLElement, label: string): HTMLElement {
    const match = [...body.querySelectorAll<HTMLElement>('main button, main a')].find((b) => b.textContent!.trim() === label);
    if (!match) {
      throw new Error(`No button "${label}"`);
    }
    return match;
  }

  function saveInvitation(token: string) {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ token, savedAt: Date.now() }));
  }

  describe('accepting an invitation', () => {
    it('asks a signed-out visitor to sign in, keeping the token off the address bar', async () => {
      const { harness, body } = await open('/invitations/accept?token=invite-123', fakeAuth({ signedIn: false }));
      await settle(harness);

      expect(text(body)).toContain('Sign in to accept');
      expect(routerOf(harness).url).toBe('/invitations/accept');
      expect(localStorage.getItem(PENDING_KEY)).toContain('invite-123');
      expect(body.querySelector('main a[href="/sign-in?returnUrl=%2Finvitations%2Faccept"]')).not.toBeNull();
    });

    it('joins the family and forgets the token', async () => {
      const { harness, http, body } = await open('/invitations/accept?token=invite-123');

      const request = http.expectOne('/api/invitations/accept');
      expect(request.request.body).toEqual({ token: 'invite-123', confirmSeparateFamily: false });
      request.flush(FAMILY);
      await settle(harness);

      expect(text(body)).toContain("You've joined Rivera Family");
      expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    });

    it('gives expired, used and cancelled links one calm answer', async () => {
      saveInvitation('used-token');
      const { harness, http, body } = await open('/invitations/accept');

      http.expectOne('/api/invitations/accept').flush(
        { title: 'This invitation isn’t valid any more.' },
        { status: 404, statusText: 'Not Found' },
      );
      await settle(harness);

      expect(text(body)).toContain("This link isn't valid any more");
      expect(text(body)).toContain('Ask your co-parent to send you a new invitation');
      expect(body.querySelector('[role=alert]')).toBeNull();
      expect(localStorage.getItem(PENDING_KEY)).toBeNull();
      expect(await axeViolations(body.querySelector('main')!)).toEqual([]);
    });

    it('says the link is not valid when there is no token at all', async () => {
      const { harness, http, body } = await open('/invitations/accept');
      await settle(harness);

      http.expectNone('/api/invitations/accept');
      expect(text(body)).toContain("This link isn't valid any more");
    });

    it('explains that families are never merged, and joins separately only after confirming', async () => {
      saveInvitation('invite-123');
      const { harness, http, body } = await open('/invitations/accept');

      http.expectOne('/api/invitations/accept').flush(
        { title: 'You already have a family on Parenthesis.', type: 'https://parenthesis.app/problems/existing-family' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(harness);
      expect(text(body)).toContain('Families are never merged');

      button(body, 'Join as a separate family').click();
      const confirm = http.expectOne('/api/invitations/accept');
      expect(confirm.request.body).toEqual({ token: 'invite-123', confirmSeparateFamily: true });
      confirm.flush(FAMILY);
      await settle(harness);

      expect(text(body)).toContain("You've joined Rivera Family");
    });

    it('explains an invitation sent to a different email address and keeps it for the right account', async () => {
      saveInvitation('invite-123');
      const { harness, http, body } = await open('/invitations/accept');

      http.expectOne('/api/invitations/accept').flush(
        { title: 'This invitation was sent to a different email address.' },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle(harness);

      expect(text(body)).toContain('This invitation was sent to a different email address.');
      expect(localStorage.getItem(PENDING_KEY)).toContain('invite-123');
    });

    // Issue #211: the inviter is still signed in on the browser where the co-parent opens "Sign up to join".
    it('keeps a sign-up invitation opened while someone else is signed in, and goes to it instead of dropping it', async () => {
      const { harness, http, body } = await open('/register?token=invite-123');

      expect(localStorage.getItem(PENDING_KEY)).toContain('invite-123');
      expect(routerOf(harness).url).toBe('/invitations/accept');
      http.expectOne('/api/invitations/accept').flush(
        { title: 'This invitation was sent to a different email address.' },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle(harness);
      expect(text(body)).toContain('Sign in with another account');
    });

    it('still keeps a signed-in parent off registration when there is no invitation', async () => {
      const { harness } = await open('/register');
      expect(routerOf(harness).url).toBe('/');
    });

    it('takes a signed-in parent with no family to their waiting invitation, not new-family setup', async () => {
      saveInvitation('invite-123');
      const { harness, http, body } = await open('/', fakeAuth({ families: [] }));

      expect(routerOf(harness).url).toBe('/invitations/accept');
      http.expectOne('/api/invitations/accept').flush(FAMILY);
      await vi.waitFor(async () => {
        await settle(harness);
        expect(text(body)).toContain("You've joined Rivera Family");
      });
    });

    it('lets a parent with no family decline for now without looping back to the invitation', async () => {
      saveInvitation('invite-123');
      const { harness, http, body } = await open('/', fakeAuth({ families: [] }));
      http.expectOne('/api/invitations/accept').flush(
        { title: 'This invitation was sent to a different email address.' },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle(harness);

      button(body, 'Not now').click();
      await settle(harness);
      expect(routerOf(harness).url).toBe('/welcome');
      expect(text(body)).toContain('You have an invitation waiting');
    });

    it('takes a parent who opens new-family setup directly to their waiting invitation first', async () => {
      saveInvitation('invite-123');
      const { harness, http } = await open('/welcome', fakeAuth({ families: [] }));

      expect(routerOf(harness).url).toBe('/invitations/accept');
      http.expectOne('/api/invitations/accept');
    });

    it('never offers new-family setup to a parent who already has a family', async () => {
      const { harness } = await open('/welcome');
      expect(routerOf(harness).url).toBe('/');
    });

    it('sends a parent whose families aren’t loaded yet home on "Not now", never to new-family setup', async () => {
      saveInvitation('invite-123');
      const auth = fakeAuth({ signedIn: true });
      // Just signed in: the family list is loaded on demand.
      const store = auth.useValue as unknown as {
        families: { set(v: FamilySummary[] | null): void };
        loadFamilies: () => Promise<FamilySummary[]>;
      };
      store.families.set(null);
      store.loadFamilies = async () => {
        store.families.set([FAMILY]);
        return [FAMILY];
      };
      const { harness, http, body } = await open('/invitations/accept', auth);
      http.expectOne('/api/invitations/accept').flush(
        { title: 'You already have a family on Parenthesis.', type: 'https://parenthesis.example/problems/existing-family' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(harness);

      button(body, 'Not now').click();
      await vi.waitFor(async () => {
        await settle(harness);
        expect(routerOf(harness).url).toBe('/');
      });
    });

    it('sends a parent with no family and no invitation to set one up, as before', async () => {
      const { harness } = await open('/', fakeAuth({ families: [] }));
      expect(routerOf(harness).url).toBe('/welcome');
    });
  });

  describe('setting up the family', () => {
    function withCreateFamily(auth: ReturnType<typeof fakeAuth>) {
      const store = auth.useValue as unknown as {
        families: { set: (f: FamilySummary[]) => void };
        createFamily: () => Promise<FamilySummary>;
      };
      store.createFamily = async () => {
        store.families.set([FAMILY]);
        return FAMILY;
      };
      return auth;
    }

    async function createFamily(harness: RouterTestingHarness, body: HTMLElement) {
      type(harness, body.querySelector<HTMLInputElement>('input[formcontrolname=name]')!, 'Rivera Family');
      body.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);
    }

    it('creates the family, adds each child as pending, then invites the co-parent', async () => {
      const { harness, http, body } = await open('/welcome', withCreateFamily(fakeAuth({ families: [] })));
      await settle(harness);
      expect(text(body)).toContain('Step 1 of 4');

      await createFamily(harness, body);
      expect(text(body)).toContain('How many children do you share with your co-parent?');
      expect(await axeViolations(body.querySelector('main')!)).toEqual([]);

      // The stepper starts at 1.
      body.querySelector<HTMLElement>('button[aria-label="One more child"]')!.click();
      harness.fixture.detectChanges();
      expect(body.querySelector('output')!.textContent!.trim()).toBe('2');
      button(body, 'Continue').click();
      await settle(harness);

      const names = body.querySelectorAll<HTMLInputElement>('main input');
      expect(names.length).toBe(2);
      type(harness, names[0], 'Kai');
      type(harness, names[1], 'Aurora');
      body.querySelector('form')!.dispatchEvent(new Event('submit'));

      const first = http.expectOne('/api/families/family-1/children');
      expect(first.request.body).toEqual({ firstName: 'Kai' });
      first.flush({ id: 'kai', firstName: 'Kai', status: 'PendingApproval', changeRequestId: 'cr-1' });
      await settle(harness);
      const second = http.expectOne('/api/families/family-1/children');
      expect(second.request.body).toEqual({ firstName: 'Aurora' });
      second.flush({ id: 'aurora', firstName: 'Aurora', status: 'PendingApproval', changeRequestId: 'cr-2' });
      await settle(harness);

      expect(text(body)).toContain('Children pending approval');
      const rows = [...body.querySelectorAll('main li')].map((li) =>
        [...li.querySelectorAll('span')].map((span) => span.textContent!.trim()).join(' | '),
      );
      expect(rows).toEqual(['Kai | Waiting for approval', 'Aurora | Waiting for approval']);

      button(body, 'Continue').click();
      await settle(harness);
      expect(text(body)).toContain('Invite your co-parent');
      expect(text(body)).toContain('They’ll approve the children you added when they join.');

      type(harness, body.querySelector<HTMLInputElement>('input[type=email]')!, 'jordan@example.test');
      body.querySelector('form')!.dispatchEvent(new Event('submit'));
      const invite = http.expectOne('/api/families/family-1/invitations');
      expect(invite.request.body).toEqual({ email: 'jordan@example.test' });
      invite.flush({ id: 'inv-1', email: 'jordan@example.test', createdAt: '2026-10-18T12:00:00Z', expiresAt: '2026-10-25T12:00:00Z' });
      await settle(harness);

      expect(text(body)).toContain('Invitation sent');
      expect(text(body)).toContain('jordan@example.test');
      expect(await axeViolations(body.querySelector('main')!)).toEqual([]);
    });

    it('keeps children that were added when a later one fails', async () => {
      const { harness, http, body } = await open('/welcome', withCreateFamily(fakeAuth({ families: [] })));
      await settle(harness);
      await createFamily(harness, body);
      body.querySelector<HTMLElement>('button[aria-label="One more child"]')!.click();
      harness.fixture.detectChanges();
      button(body, 'Continue').click();
      await settle(harness);
      const names = body.querySelectorAll<HTMLInputElement>('main input');
      type(harness, names[0], 'Kai');
      type(harness, names[1], 'Aurora');
      body.querySelector('form')!.dispatchEvent(new Event('submit'));

      http.expectOne('/api/families/family-1/children').flush({ id: 'kai', firstName: 'Kai', status: 'PendingApproval', changeRequestId: 'cr-1' });
      await settle(harness);
      http.expectOne('/api/families/family-1/children').flush(null, { status: 500, statusText: 'Server Error' });
      await settle(harness);

      expect(body.querySelector('[role=alert]')!.textContent).toContain('1 child was added.');
      const remaining = body.querySelectorAll<HTMLInputElement>('main input');
      expect(remaining.length).toBe(1);
      expect(remaining[0].value).toBe('Aurora');
    });

    it('goes straight to inviting the co-parent with no children yet', async () => {
      const { harness, body } = await open('/welcome', withCreateFamily(fakeAuth({ families: [] })));
      await settle(harness);
      await createFamily(harness, body);

      body.querySelector<HTMLElement>('button[aria-label="One fewer child"]')!.click();
      harness.fixture.detectChanges();
      button(body, 'Continue').click();
      await settle(harness);

      expect(text(body)).toContain('Invite your co-parent');
      expect(text(body)).not.toContain('They’ll approve the children');
    });

    it('still points to the invitation from setup after the parent chose "Not now"', async () => {
      saveInvitation('invite-123');
      const { harness, http, body } = await open('/welcome', fakeAuth({ families: [] }));
      // Setup takes them to the invitation first (#211); they put it off.
      http.expectOne('/api/invitations/accept').flush(
        { title: 'This invitation was sent to a different email address.' },
        { status: 403, statusText: 'Forbidden' },
      );
      await settle(harness);
      button(body, 'Not now').click();
      await vi.waitFor(async () => {
        await settle(harness);
        expect(routerOf(harness).url).toBe('/welcome');
      });

      expect(text(body)).toContain('You have an invitation waiting');
      expect(body.querySelector('a[href="/invitations/accept"]')).not.toBeNull();
    });
  });

  describe('signing in', () => {
    it('takes an invited co-parent to their invitation after signing in', async () => {
      saveInvitation('invite-123');
      const { harness, http } = await open('/sign-in', fakeAuth({ signedIn: false }));
      const store = TestBed.inject(AuthStore) as unknown as {
        signIn: () => Promise<void>;
        status: { set: (s: string) => void };
      };
      store.signIn = async () => store.status.set('signed-in');

      const inputs = harness.routeNativeElement!.querySelectorAll<HTMLInputElement>('input');
      type(harness, inputs[0], 'jordan@example.test');
      type(harness, inputs[1], 'twelve chars ok');
      harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(harness);

      expect(routerOf(harness).url).toBe('/invitations/accept');
      http.expectOne('/api/invitations/accept');
    });
  });

  describe('settings', () => {
    it('offers to invite the co-parent until they join', async () => {
      const { harness, http, body } = await open('/settings');
      http.expectOne('/api/families/family-1').flush({
        ...FAMILY,
        createdAt: '2026-10-01T00:00:00Z',
        members: [{ membershipId: 'm1', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '2026-10-01T00:00:00Z' }],
      });
      http.expectOne('/api/families/family-1/invitations').flush([]);
      await settle(harness);

      expect(text(body)).toContain('Invite your co-parent');
      expect(body.querySelector('input[type=email]')).not.toBeNull();
    });

    it('shows a waiting invitation, which can be cancelled', async () => {
      const { harness, http, body } = await open('/settings');
      http.expectOne('/api/families/family-1').flush({
        ...FAMILY,
        createdAt: '2026-10-01T00:00:00Z',
        members: [{ membershipId: 'm1', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '2026-10-01T00:00:00Z' }],
      });
      http.expectOne('/api/families/family-1/invitations').flush([
        { id: 'inv-1', email: 'jordan@example.test', createdAt: '2026-10-18T12:00:00Z', expiresAt: '2026-10-25T12:00:00Z' },
      ]);
      await settle(harness);
      expect(text(body)).toContain('Invitation sent');

      button(body, 'Cancel invitation').click();
      const revoke = http.expectOne('/api/families/family-1/invitations/inv-1');
      expect(revoke.request.method).toBe('DELETE');
      revoke.flush(null, { status: 204, statusText: 'No Content' });
      await settle(harness);

      expect(text(body)).toContain('Invitation cancelled');
      expect(body.querySelector('input[type=email]')).not.toBeNull();
    });

    it('names the co-parent once they have joined', async () => {
      const { harness, http, body } = await open('/settings');
      http.expectOne('/api/families/family-1').flush({
        ...FAMILY,
        createdAt: '2026-10-01T00:00:00Z',
        members: [
          { membershipId: 'm1', displayName: 'Alex Rivera', role: 'Parent', joinedAt: '2026-10-01T00:00:00Z' },
          { membershipId: 'm2', displayName: 'Jordan Lee', role: 'Parent', joinedAt: '2026-10-02T00:00:00Z' },
        ],
      });
      http.expectOne('/api/families/family-1/invitations').flush([]);
      await settle(harness);

      expect(text(body)).toContain('You share Rivera Family with Jordan Lee');
      expect(body.querySelector('input[type=email]')).toBeNull();
    });
  });
});
