import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

// Hand-written to match the API's OpenAPI document for the endpoints Milestone 1 uses. Generating these from the
// document is planned once the surface grows.

export interface Me {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export type FamilyRole = 'Parent' | 'Child';

export interface FamilySummary {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly role: FamilyRole;
}

/** Thin, typed wrappers over the /api endpoints. Relative URLs, so Angular attaches the X-XSRF-TOKEN header. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  antiforgery = () => this.call(this.http.get<void>('/api/antiforgery'));
  me = () => this.call(this.http.get<Me>('/api/me'));

  register = (body: { email: string; password: string; displayName: string }) =>
    this.call(this.http.post<void>('/api/auth/register', body));
  login = (body: { email: string; password: string }) => this.call(this.http.post<void>('/api/auth/login', body));
  logout = () => this.call(this.http.post<void>('/api/auth/logout', {}));
  confirmEmail = (body: { userId: string; token: string }) =>
    this.call(this.http.post<void>('/api/auth/confirm-email', body));
  resendConfirmation = (email: string) =>
    this.call(this.http.post<void>('/api/auth/resend-confirmation', { email }));
  forgotPassword = (email: string) => this.call(this.http.post<void>('/api/auth/forgot-password', { email }));
  resetPassword = (body: { email: string; token: string; password: string }) =>
    this.call(this.http.post<void>('/api/auth/reset-password', body));

  myFamilies = () => this.call(this.http.get<FamilySummary[]>('/api/me/families'));
  createFamily = (body: { name: string; timeZone: string }) =>
    this.call(this.http.post<FamilySummary>('/api/families', body));

  private call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }
}
