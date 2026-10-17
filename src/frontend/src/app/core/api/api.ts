import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

// Hand-written to match the API's OpenAPI document for the endpoints Milestones 1 and 2 use. Generating these from the
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

// --- Milestone 2 (ADR-0006): invitations, children, approvals, devices, the profile picker -----------------------------

export interface InvitationSummary {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type ChildStatus = 'PendingApproval' | 'Active' | 'Rejected' | 'Archived';

export interface Child {
  readonly id: string;
  readonly firstName: string;
  readonly status: ChildStatus;
  /** Set when the child was just added: the approval request the co-parent answers. */
  readonly changeRequestId: string | null;
}

export type ChangeRequestType = 'ChildCreate' | 'ChildPinChange';

export interface ChangeRequest {
  readonly id: string;
  readonly type: ChangeRequestType;
  readonly targetType: string;
  readonly targetId: string;
  readonly summary: string;
  readonly status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  readonly proposerMembershipId: string;
  readonly createdAt: string;
  readonly approvals: number;
  readonly requiredApprovals: number;
  /** True when this parent can still approve or reject it (not the proposer, hasn't answered). */
  readonly canDecide: boolean;
  readonly resolvedAt: string | null;
  readonly decisions: readonly { deciderMembershipId: string; decision: 'Approve' | 'Reject'; comment: string | null; decidedAt: string }[];
}

export type DeviceKind = 'Household' | 'ChildPaired';

export interface Device {
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceKind;
  readonly childProfileId: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
}

export interface ProfileTile {
  readonly kind: 'parent' | 'child';
  readonly id: string;
  readonly name: string;
  readonly canSignIn: boolean;
  readonly locked: boolean;
}

export interface DeviceProfiles {
  readonly familyName: string;
  readonly deviceKind: DeviceKind;
  readonly profiles: readonly ProfileTile[];
}

export interface ChildSession {
  readonly childId: string;
  readonly firstName: string;
  readonly familyId: string;
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

  // Co-parent invitations (FM-03). The answer to "send" is the same whether or not the address has an account.
  invitations = (familyId: string) => this.call(this.http.get<InvitationSummary[]>(`/api/families/${familyId}/invitations`));
  invite = (familyId: string, email: string) =>
    this.call(this.http.post<InvitationSummary>(`/api/families/${familyId}/invitations`, { email }));
  revokeInvitation = (familyId: string, invitationId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/invitations/${invitationId}`));
  /** Problem type `…/existing-family` (409) means: confirm it's a separate family, or leave the other one first. */
  acceptInvitation = (token: string, confirmSeparateFamily = false) =>
    this.call(this.http.post<FamilySummary>('/api/invitations/accept', { token, confirmSeparateFamily }));

  // Children (FM-04): added as pending until both parents approve.
  children = (familyId: string) => this.call(this.http.get<Child[]>(`/api/families/${familyId}/children`));
  addChild = (familyId: string, firstName: string) =>
    this.call(this.http.post<Child>(`/api/families/${familyId}/children`, { firstName }));

  // Approvals inbox (ADR-0003).
  /** Pending requests, or the 50 most recently decided with `history`. */
  approvals = (familyId: string, view: 'pending' | 'history' = 'pending') =>
    this.call(this.http.get<ChangeRequest[]>(`/api/families/${familyId}/approvals`, { params: view === 'history' ? { view } : {} }));
  approve = (familyId: string, requestId: string, comment?: string) =>
    this.call(this.http.post<ChangeRequest>(`/api/families/${familyId}/approvals/${requestId}/approve`, { comment }));
  reject = (familyId: string, requestId: string, comment?: string) =>
    this.call(this.http.post<ChangeRequest>(`/api/families/${familyId}/approvals/${requestId}/reject`, { comment }));
  withdraw = (familyId: string, requestId: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/approvals/${requestId}/withdraw`, {}));

  // A child's sign-in (ADR-0006). The first PIN applies at once; changing one returns 202 and waits for approval.
  setChildPin = (familyId: string, childId: string, pin: string) =>
    this.call(this.http.put<{ changeRequestId: string } | null>(`/api/families/${familyId}/children/${childId}/pin`, { pin }));
  disableChildSignIn = (familyId: string, childId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/children/${childId}/pin`));
  unlockChild = (familyId: string, childId: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/children/${childId}/unlock`, {}));
  pairingCode = (familyId: string, childId: string) =>
    this.call(this.http.post<{ code: string; expiresAt: string }>(`/api/families/${familyId}/children/${childId}/pairing-code`, {}));

  // Devices.
  devices = (familyId: string) => this.call(this.http.get<Device[]>(`/api/families/${familyId}/devices`));
  registerHouseholdDevice = (familyId: string, name: string) =>
    this.call(this.http.post<Device>(`/api/families/${familyId}/devices/household`, { name }));
  removeDevice = (familyId: string, deviceId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/devices/${deviceId}`));

  // The profile picker on a registered device. After a child signs in, or a parent signs back in, fetch a fresh
  // antiforgery token: tokens are tied to who is signed in.
  deviceProfiles = () => this.call(this.http.get<DeviceProfiles>('/api/device/profiles'));
  childSignIn = (childId: string, pin: string) =>
    this.call(this.http.post<void>('/api/device/child-session', { childId, pin }));
  pairDevice = (code: string, deviceName: string) =>
    this.call(this.http.post<{ childId: string; childFirstName: string }>('/api/device/pair', { code, deviceName }));
  childSession = () => this.call(this.http.get<ChildSession>('/api/session/child'));

  private call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }
}
