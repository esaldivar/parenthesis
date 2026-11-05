import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppearanceService } from '../theme/appearance.service';
import { ProfilePhotos } from '../profile-photos/profile-photos';
import { AuthStore } from './auth.store';

/** Synthetic family only. */
const PICKER = {
  familyName: 'Rivera Family',
  deviceKind: 'Household',
  profiles: [
    { kind: 'parent', id: 'm1', name: 'Dad', canSignIn: true, locked: false },
    { kind: 'child', id: 'kai', name: 'Kai', canSignIn: true, locked: false },
  ],
};

describe('AuthStore', () => {
  let http: HttpTestingController;
  let store: AuthStore;
  let accounts: (string | null)[];
  let photoFamilies: (string | null)[];

  beforeEach(() => {
    accounts = [];
    photoFamilies = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppearanceService, useValue: { useAccount: (id: string | null) => accounts.push(id) } },
        { provide: ProfilePhotos, useValue: { load: (familyId: string | null) => photoFamilies.push(familyId) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  /** Answers the outstanding requests in order, letting the store's awaits run in between. */
  async function respond(...responses: [url: string, status: number, body?: unknown][]) {
    for (const [url, status, body] of responses) {
      // expectOne throws until the request exists (match() would consume it while polling).
      const request = await vi.waitFor(() => http.expectOne(url));
      request.flush(body ?? null, { status, statusText: String(status) });
    }
  }

  it('starts anonymous when the API says nobody is signed in', async () => {
    const init = store.initialize();
    await respond(['/api/antiforgery', 204], ['/api/me', 401], ['/api/device/profiles', 404]);
    await init;

    expect(store.status()).toBe('anonymous');
    expect(store.user()).toBeNull();
    expect(store.device()).toBeNull();
    expect(accounts).toEqual([null]);
  });

  it('remembers this device’s profile picker when it is a registered device', async () => {
    const init = store.initialize();
    await respond(['/api/antiforgery', 204], ['/api/me', 401], ['/api/device/profiles', 200, PICKER]);
    await init;

    expect(store.device()?.familyName).toBe('Rivera Family');
  });

  it('still starts when the picker can’t be loaded, treating the device as unregistered', async () => {
    const init = store.initialize();
    await respond(['/api/antiforgery', 204], ['/api/me', 401], ['/api/device/profiles', 500]);
    await init;

    expect(store.status()).toBe('anonymous');
    expect(store.device()).toBeNull();
  });

  it('recognises a child session, which /api/me refuses, and gives the child their own appearance', async () => {
    const init = store.initialize();
    await respond(
      ['/api/antiforgery', 204],
      ['/api/me', 403],
      ['/api/session/child', 200, { childId: 'kai', firstName: 'Kai', familyId: 'f1' }],
      ['/api/device/profiles', 200, PICKER],
    );
    await init;

    expect(store.status()).toBe('child');
    expect(store.child()?.firstName).toBe('Kai');
    expect(store.user()).toBeNull();
    expect(accounts).toEqual(['child:kai']);
  });

  it('loads photos for whoever is signed in and clears them when the profile changes (#388)', async () => {
    const init = store.initialize();
    await respond(
      ['/api/antiforgery', 204],
      ['/api/me', 403],
      ['/api/session/child', 200, { childId: 'kai', firstName: 'Kai', familyId: 'f1' }],
      ['/api/device/profiles', 200, PICKER],
    );
    await init;
    TestBed.tick();
    expect(photoFamilies.at(-1)).toBe('f1');

    const signOut = store.signOut();
    await respond(['/api/auth/logout', 204], ['/api/antiforgery', 204], ['/api/device/profiles', 200, PICKER]);
    await signOut;
    TestBed.tick();
    expect(photoFamilies.at(-1)).toBeNull();

    const load = store.loadFamilies();
    store.user.set({ id: 'user-1', email: 'dad@example.test', displayName: 'Dad' });
    store.status.set('signed-in');
    await respond(['/api/me/families', 200, [{ id: 'f2', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }]]);
    await load;
    TestBed.tick();
    expect(photoFamilies.at(-1)).toBe('f2');
  });

  it('gets a fresh antiforgery token after a child signs in with their PIN', async () => {
    const signIn = store.childSignIn('kai', '2580');
    const request = await vi.waitFor(() => http.expectOne('/api/device/child-session'));
    expect(request.request.body).toEqual({ childId: 'kai', pin: '2580' });
    request.flush(null, { status: 204, statusText: '204' });
    await respond(
      ['/api/antiforgery', 204],
      ['/api/me', 403],
      ['/api/session/child', 200, { childId: 'kai', firstName: 'Kai', familyId: 'f1' }],
    );
    await signIn;

    expect(store.status()).toBe('child');
  });

  it('propagates a wrong PIN so the page can show the tries left', async () => {
    const signIn = store.childSignIn('kai', '1357');
    await respond(['/api/device/child-session', 401, { title: 'That PIN didn’t work.', triesLeft: 2 }]);

    await expect(signIn).rejects.toMatchObject({ status: 401 });
  });

  it('pairs a tablet: signed out, a fresh antiforgery token, and the child’s picker', async () => {
    const pair = store.pairDevice('ABCD-2345', 'Kai’s tablet');
    await respond(
      ['/api/device/pair', 200, { childId: 'kai', childFirstName: 'Kai' }],
      ['/api/antiforgery', 204],
      ['/api/device/profiles', 200, { ...PICKER, deviceKind: 'ChildPaired' }],
    );

    expect((await pair).childFirstName).toBe('Kai');
    expect(store.status()).toBe('anonymous');
    expect(store.device()?.deviceKind).toBe('ChildPaired');
  });

  it('loads the signed-in user and switches to their own appearance', async () => {
    const init = store.initialize();
    await respond(
      ['/api/antiforgery', 204],
      ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Alex' }],
      ['/api/me/families', 200, []],
      ['/api/device/profiles', 404],
    );
    await init;

    expect(store.status()).toBe('signed-in');
    expect(accounts).toEqual(['u1']);
  });

  it('starts its first requests together, and has the parent’s families ready before the first page (#415)', async () => {
    const init = store.initialize();
    // All three are in flight before any answer arrives: no round trip waits for another.
    const antiforgery = http.expectOne('/api/antiforgery');
    const me = http.expectOne('/api/me');
    const device = http.expectOne('/api/device/profiles');
    antiforgery.flush(null, { status: 204, statusText: 'No content' });
    me.flush({ id: 'u1', email: 'a@example.test', displayName: 'Alex' });
    const families = await vi.waitFor(() => http.expectOne('/api/me/families'));
    families.flush([{ id: 'f1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }]);
    device.flush(null, { status: 404, statusText: 'Not found' });
    await init;

    expect(store.currentFamily()?.id).toBe('f1');
  });

  it('still starts when the families can’t be loaded, leaving them for the first page to fetch', async () => {
    const init = store.initialize();
    await respond(
      ['/api/antiforgery', 204],
      ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Alex' }],
      ['/api/me/families', 500],
      ['/api/device/profiles', 404],
    );
    await init;

    expect(store.status()).toBe('signed-in');
    expect(store.families()).toBeNull();
  });

  it('gets a fresh antiforgery token after signing in, because tokens belong to the user', async () => {
    const signIn = store.signIn('a@example.test', 'correct horse battery staple');
    await respond(
      ['/api/auth/login', 204],
      ['/api/antiforgery', 204],
      ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Alex' }],
      ['/api/device/profiles', 404],
    );
    await signIn;

    expect(store.user()?.displayName).toBe('Alex');
  });

  it('reloads the picker as the parent after a PIN sign-in, so it knows the device is theirs (#153)', async () => {
    const signIn = store.parentPinSignIn('m1', '583920');
    await respond(
      ['/api/device/parent-session', 204],
      ['/api/antiforgery', 204],
      ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Dad' }],
      ['/api/device/profiles', 200, { ...PICKER, isYours: true }],
    );
    await signIn;

    expect(store.status()).toBe('signed-in');
    expect(store.device()?.isYours).toBe(true);
  });

  it('propagates a failed sign-in so the form can explain it', async () => {
    const signIn = store.signIn('a@example.test', 'wrong');
    await respond(['/api/auth/login', 401, { title: 'Invalid email or password.' }]);

    await expect(signIn).rejects.toMatchObject({ status: 401 });
    expect(store.status()).toBe('unknown');
  });

  it('clears the user, families and appearance on sign-out, even if the request fails', async () => {
    const signOut = store.signOut();
    await respond(['/api/auth/logout', 500], ['/api/antiforgery', 204], ['/api/device/profiles', 404]);
    await signOut.catch(() => undefined);

    expect(store.status()).toBe('anonymous');
    expect(store.families()).toBeNull();
    expect(accounts).toEqual([null]);
  });
  describe('“Is this a shared family device?” (#153)', () => {
    const FAMILIES = [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Parent' }];
    const ME = { id: 'user-1', email: 'dad@example.test', displayName: 'Dad' };

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    async function signedIn() {
      const signIn = store.signIn('dad@example.test', 'correct horse battery staple');
      await respond(['/api/auth/login', 204], ['/api/antiforgery', 204], ['/api/me', 200, ME], ['/api/device/profiles', 404]);
      await signIn;
    }

    async function offered() {
      const ask = store.shouldOfferSharedSetup();
      await respond(['/api/me/families', 200, FAMILIES], ['/api/device/profiles', 404]);
      return ask;
    }

    it('asks a parent with a family on a browser that isn’t their shared device', async () => {
      await signedIn();

      expect(await offered()).toBe(true);
    });

    it('stops asking in this browser once that parent says no, without affecting another parent', async () => {
      await signedIn();
      store.declineSharedSetup();

      expect(await offered()).toBe(false);
      expect(localStorage.getItem('parenthesis.sharedDevice.declined:user-1')).toBe('1');
      expect(localStorage.getItem('parenthesis.sharedDevice.declined:user-2')).toBeNull();
    });
  });

  describe('signing out of another parent’s shared device (#405)', () => {
    // Synthetic Parent A (Dad) set this browser up as a shared device; Parent B (Mom) signs in with a password.
    const PARENT_A_DEVICE = { ...PICKER, isYours: false };
    const PARENT_A_OWN = { ...PICKER, isYours: true };
    const PARENT_A = { id: 'user-a', email: 'dad@example.test', displayName: 'Dad' };
    const PARENT_B = { id: 'user-b', email: 'mom@example.test', displayName: 'Mom' };

    beforeEach(() => sessionStorage.clear());
    afterEach(() => sessionStorage.clear());

    async function passwordSignIn(me: typeof PARENT_A, picker: unknown) {
      const signIn = store.signIn(me.email, 'correct horse battery staple');
      await respond(['/api/auth/login', 204], ['/api/antiforgery', 204], ['/api/me', 200, me], ['/api/device/profiles', 200, picker]);
      await signIn;
    }

    async function signOut() {
      const done = store.signOut();
      // The device stays Parent A's: the server still lists Parent A to a signed-out browser.
      await respond(['/api/auth/logout', 204], ['/api/antiforgery', 204], ['/api/device/profiles', 200, PARENT_A_DEVICE]);
      await done;
    }

    it('sends the other parent to sign-in, not to the device owner’s picker', async () => {
      await passwordSignIn(PARENT_B, PARENT_A_DEVICE);
      await signOut();

      expect(store.status()).toBe('anonymous');
      expect(store.device()?.familyName).toBe('Rivera Family'); // The device is still registered for Parent A.
      expect(store.pickerOffered()).toBe(false);
    });

    it('keeps the picker set aside after a reload of the same tab', async () => {
      await passwordSignIn(PARENT_B, PARENT_A_DEVICE);
      await signOut();

      const reloaded = TestBed.inject(AuthStore).constructor as new () => AuthStore;
      const fresh = TestBed.runInInjectionContext(() => new reloaded());
      fresh.device.set(PARENT_A_DEVICE as never);
      expect(fresh.pickerOffered()).toBe(false);
    });

    it('still returns the device owner to their own picker', async () => {
      await passwordSignIn(PARENT_A, PARENT_A_OWN);
      await signOut();

      expect(store.pickerOffered()).toBe(true);
    });

    it('decides afresh for each parent in repeated A → B → A sign-ins', async () => {
      await passwordSignIn(PARENT_A, PARENT_A_OWN);
      await signOut();
      expect(store.pickerOffered()).toBe(true);

      await passwordSignIn(PARENT_B, PARENT_A_DEVICE);
      await signOut();
      expect(store.pickerOffered()).toBe(false);

      await passwordSignIn(PARENT_A, PARENT_A_OWN);
      expect(store.pickerOffered()).toBe(true);
      await signOut();
      expect(store.pickerOffered()).toBe(true);
    });

    it('goes to sign-in when it isn’t known whose device this is', async () => {
      const signIn = store.signIn(PARENT_B.email, 'correct horse battery staple');
      await respond(['/api/auth/login', 204], ['/api/antiforgery', 204], ['/api/me', 200, PARENT_B], ['/api/device/profiles', 500]);
      await signIn;
      await signOut();

      expect(store.pickerOffered()).toBe(false);
    });

    it('sets the picker aside after Switch profile too', async () => {
      await passwordSignIn(PARENT_B, PARENT_A_DEVICE);
      const done = store.switchProfile();
      await respond(['/api/device/switch', 204], ['/api/antiforgery', 204], ['/api/device/profiles', 200, PARENT_A_DEVICE]);
      await done;

      expect(store.pickerOffered()).toBe(false);
    });
  });
});
