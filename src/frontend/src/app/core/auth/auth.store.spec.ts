import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppearanceService } from '../theme/appearance.service';
import { AuthStore } from './auth.store';

describe('AuthStore', () => {
  let http: HttpTestingController;
  let store: AuthStore;
  let accounts: (string | null)[];

  beforeEach(() => {
    accounts = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppearanceService, useValue: { useAccount: (id: string | null) => accounts.push(id) } },
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
    await respond(['/api/antiforgery', 204], ['/api/me', 401]);
    await init;

    expect(store.status()).toBe('anonymous');
    expect(store.user()).toBeNull();
    expect(accounts).toEqual([null]);
  });

  it('loads the signed-in user and switches to their own appearance', async () => {
    const init = store.initialize();
    await respond(['/api/antiforgery', 204], ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Alex' }]);
    await init;

    expect(store.status()).toBe('signed-in');
    expect(accounts).toEqual(['u1']);
  });

  it('gets a fresh antiforgery token after signing in, because tokens belong to the user', async () => {
    const signIn = store.signIn('a@example.test', 'correct horse battery staple');
    await respond(
      ['/api/auth/login', 204],
      ['/api/antiforgery', 204],
      ['/api/me', 200, { id: 'u1', email: 'a@example.test', displayName: 'Alex' }],
    );
    await signIn;

    expect(store.user()?.displayName).toBe('Alex');
  });

  it('propagates a failed sign-in so the form can explain it', async () => {
    const signIn = store.signIn('a@example.test', 'wrong');
    await respond(['/api/auth/login', 401, { title: 'Invalid email or password.' }]);

    await expect(signIn).rejects.toMatchObject({ status: 401 });
    expect(store.status()).toBe('unknown');
  });

  it('clears the user, families and appearance on sign-out, even if the request fails', async () => {
    const signOut = store.signOut();
    await respond(['/api/auth/logout', 500], ['/api/antiforgery', 204]);
    await signOut.catch(() => undefined);

    expect(store.status()).toBe('anonymous');
    expect(store.families()).toBeNull();
    expect(accounts).toEqual([null]);
  });
});
