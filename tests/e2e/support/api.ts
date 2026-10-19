import { APIRequestContext, APIResponse, expect, request } from '@playwright/test';
import { linkFromEmail } from './mailpit';
import { PASSWORD, newEmail } from './data';

const baseURL = process.env['E2E_BASE_URL'] ?? 'https://localhost:8443';

/**
 * One device's session with the API, as the SPA would have it: cookies plus the antiforgery header on unsafe
 * requests (ADR-0004). Used to set up synthetic families quickly, and to test features that have no screen yet.
 */
export class ApiSession {
  private constructor(readonly http: APIRequestContext) {}

  static async start(): Promise<ApiSession> {
    const session = new ApiSession(await request.newContext({ baseURL, ignoreHTTPSErrors: true }));
    await session.refreshAntiforgery();
    return session;
  }

  /** A confirmed, signed-in parent with a fresh synthetic email. */
  static async parent(displayName: string, email = newEmail(displayName)): Promise<ApiSession & { email: string }> {
    const session = await ApiSession.start();
    expect((await session.post('/api/auth/register', { email, password: PASSWORD, displayName })).status()).toBe(202);
    const link = await linkFromEmail(email, 'Confirm your email', '/confirm-email');
    const confirm = await session.post('/api/auth/confirm-email', {
      userId: link.searchParams.get('userId'),
      token: link.searchParams.get('token'),
    });
    expect(confirm.status()).toBe(204);
    await session.signIn(email);
    return Object.assign(session, { email });
  }

  async signIn(email: string, password = PASSWORD): Promise<void> {
    expect((await this.post('/api/auth/login', { email, password })).status()).toBe(204);
    // Tokens are tied to the signed-in user, so get a new one after signing in.
    await this.refreshAntiforgery();
  }

  async refreshAntiforgery(): Promise<void> {
    expect((await this.http.get('/api/antiforgery')).status()).toBe(204);
  }

  get(path: string, params?: Record<string, string>): Promise<APIResponse> {
    return this.http.get(path, params ? { params } : undefined);
  }

  post(path: string, data?: unknown): Promise<APIResponse> {
    return this.send('POST', path, data);
  }

  put(path: string, data?: unknown): Promise<APIResponse> {
    return this.send('PUT', path, data);
  }

  delete(path: string): Promise<APIResponse> {
    return this.send('DELETE', path);
  }

  async json<T = Record<string, unknown>>(response: Promise<APIResponse> | APIResponse): Promise<T> {
    const resolved = await response;
    expect(resolved.ok(), `${resolved.url()} answered ${resolved.status()}: ${await resolved.text()}`).toBeTruthy();
    return (await resolved.json()) as T;
  }

  async dispose(): Promise<void> {
    await this.http.dispose();
  }

  private async send(method: string, path: string, data?: unknown): Promise<APIResponse> {
    const { cookies } = await this.http.storageState();
    const token = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    return this.http.fetch(path, { method, data, headers: { 'X-XSRF-TOKEN': token } });
  }
}
