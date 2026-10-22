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

export interface FamilyMember {
  readonly membershipId: string;
  readonly displayName: string;
  readonly role: FamilyRole;
  readonly joinedAt: string;
  /** The signed-in user's own membership. */
  readonly isYou: boolean;
}

export interface FamilyDetails {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly createdAt: string;
  readonly members: readonly FamilyMember[];
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
  /** Whether the child has a PIN, is locked after three wrong tries, or has a new PIN waiting for approval. */
  readonly signIn: ChildSignIn;
}

export interface ChildSignIn {
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly pinChangePending: boolean;
}

export type ChangeRequestType =
  | 'ChildCreate'
  | 'ChildPinChange'
  | 'CalendarCreate'
  | 'JointEventCreate'
  | 'CalendarModify'
  | 'CalendarCancel';

export interface ChangeRequest {
  readonly id: string;
  readonly type: ChangeRequestType;
  readonly targetType: string;
  readonly targetId: string;
  readonly summary: string;
  /** The proposer's optional note to the other parent (e.g. why they ask for a swap). Shown in the app only. */
  readonly reason: string | null;
  readonly status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  readonly proposerMembershipId: string;
  readonly createdAt: string;
  readonly approvals: number;
  readonly requiredApprovals: number;
  /** True when this parent can still approve or reject it (not the proposer, hasn't answered). */
  readonly canDecide: boolean;
  /** True when this parent proposed it, so they can withdraw it while it's pending. */
  readonly proposedByYou: boolean;
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

// --- Milestone 3: the shared calendar (docs/design/CALENDAR_DECISIONS.md) -------------------------------------------------

export type CalendarCategory =
  | 'ParentingTime'
  | 'Joint'
  | 'School'
  | 'Medical'
  | 'Dental'
  | 'Activity'
  | 'Birthday'
  | 'Holiday'
  | 'Unavailable'
  | 'Other';

export type CalendarStatus = 'PendingApproval' | 'Confirmed' | 'Rejected' | 'Cancelled';

/** Gentle, non-blocking notes about conflicts. They never block a request or reassign parenting time. */
export type CalendarWarning =
  | 'OverlapsCoParentUnavailable'
  | 'CaregiverUnavailable'
  | 'OverlapsParentingTime'
  | 'OverlapsYourParentingTime';

export interface ProposedTimes {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly allDay: boolean;
  readonly location: string | null;
  readonly caregiverMembershipId: string | null;
}

export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly category: CalendarCategory;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly allDay: boolean;
  readonly location: string | null;
  /** Only the owner sees an Unavailable event's notes; children never see notes. */
  readonly notes: string | null;
  readonly status: CalendarStatus;
  readonly childIds: readonly string[];
  readonly caregiverMembershipId: string | null;
  readonly ownerMembershipId: string;
  readonly confirmedBeforeCoParentJoined: boolean;
  readonly changeRequestId: string | null;
  /** "Confirmed · change pending": Modify shows `proposed` (before → after); Cancel awaits approval. */
  readonly pendingChange: 'None' | 'Modify' | 'Cancel';
  readonly proposed: ProposedTimes | null;
  readonly warnings: readonly CalendarWarning[];
  /** A repeating event's series (#193): each date is its own event; `repeat` says how it repeats. */
  readonly seriesId?: string | null;
  readonly repeat?: EventRepeat | null;
}

export interface NewCalendarEvent {
  readonly category: CalendarCategory;
  readonly title?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly notes?: string;
  readonly childIds?: readonly string[];
  readonly caregiverMembershipId?: string;
  /** Unavailable time and activities only (#193): weekly on these days, ending on `until` or after `count` times. */
  readonly repeat?: { readonly days: readonly Weekday[]; readonly until?: string; readonly count?: number };
}

/** Weekdays as the API names them (#193). */
export type Weekday = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

/** How a repeating event repeats. */
export interface EventRepeat {
  readonly days: readonly Weekday[];
  /** `YYYY-MM-DD`, inclusive. */
  readonly until: string | null;
  readonly count: number | null;
}

/** Which dates of a repeating event an edit or cancel applies to. */
export type EditScope = 'this' | 'following' | 'all';

export type RepeatFrequency = 'None' | 'Daily' | 'Weekly' | 'Monthly';

/**
 * A shared reminder (#72). Either parent changes it at once, with no approval. In a list, a repeating reminder comes
 * once per occurrence: `startsAt` is that occurrence and `seriesStartsAt` the first one.
 */
export interface Reminder {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly allDay: boolean;
  readonly childId: string | null;
  readonly details: string | null;
  readonly createdByMembershipId: string;
  readonly createdAt: string;
  /** The other parent who last edited it (null when nobody did, or you did): the quiet "edited by" note. */
  readonly editedBy: string | null;
  readonly lastEditedAt: string | null;
  /** Parents who opened its details, and when. Set only by opening the details. */
  readonly seenBy: readonly { membershipId: string; seenAt: string }[];
  readonly repeat: RepeatFrequency;
  readonly repeatUntil: string | null;
  readonly repeatCount: number | null;
  readonly seriesStartsAt: string;
}

/** A checklist line on a task, with who ticked it and when (#175). */
export interface ChecklistItem {
  readonly id: string;
  readonly text: string;
  readonly required: boolean;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
}

/**
 * A shared task (#73), due on a local date, with no assignee. Either parent changes it at once, with no approval. With
 * a checklist, it's done when its deciding items are (the required ones, or all when none are); without one, Mark
 * done decides. `justCompleted` is true only in the response to the change that completed it.
 */
export interface SharedTask {
  readonly id: string;
  readonly title: string;
  /** `YYYY-MM-DD` in the family's time zone. */
  readonly dueDate: string;
  readonly childId: string | null;
  readonly details: string | null;
  readonly createdByMembershipId: string;
  readonly createdAt: string;
  /** The other parent who last edited it (null when nobody did, or you did). */
  readonly editedBy: string | null;
  readonly lastEditedAt: string | null;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  readonly seenBy: readonly { membershipId: string; seenAt: string }[];
  readonly items: readonly ChecklistItem[];
  readonly progressDone: number;
  readonly progressTotal: number;
  /** Send it back with an edit; a stale one gets 409 instead of overwriting the other parent's change. */
  readonly version: number;
  readonly justCompleted: boolean;
}

/**
 * Create and edit a task (an edit replaces the whole task, checklist included). An item with an `id` keeps its tick;
 * one without is new. Edits send the `version` they were made from.
 */
export interface TaskInput {
  readonly title: string;
  readonly dueDate: string;
  readonly childId?: string | null;
  readonly details?: string;
  readonly items: readonly { id?: string; text: string; required: boolean }[];
  readonly version?: number;
}

/** Create and edit (an edit replaces the whole reminder; repeats change for the whole series). */
export interface ReminderInput {
  readonly title: string;
  readonly startsAt: string;
  readonly allDay: boolean;
  readonly childId?: string | null;
  readonly details?: string;
  readonly repeat: RepeatFrequency;
  /** `YYYY-MM-DD`, inclusive. Exactly one of repeatUntil or repeatCount when it repeats. */
  readonly repeatUntil?: string;
  readonly repeatCount?: number;
}

export type CalendarEventChange = Partial<Omit<NewCalendarEvent, 'category' | 'childIds'>> & {
  /** An optional note to the other parent, kept with the approval request (a swap's reason). Up to 500 characters. */
  readonly reason?: string;
};

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
  /** Permanently deletes the signed-in parent's account (A-12). A wrong password is a 400 with a `password` error. */
  deleteAccount = (password: string) => this.call(this.http.post<void>('/api/me/delete', { password }));
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
  family = (familyId: string) => this.call(this.http.get<FamilyDetails>(`/api/families/${familyId}`));

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

  // The shared calendar. A range spans at most 62 days. Children may list (they see only their confirmed events).
  calendarEvents = (familyId: string, from: string, to: string) =>
    this.call(this.http.get<CalendarEvent[]>(`/api/families/${familyId}/calendar/events`, { params: { from, to } }));
  /** One event, for a parent. */
  calendarEvent = (familyId: string, eventId: string) =>
    this.call(this.http.get<CalendarEvent>(`/api/families/${familyId}/calendar/events/${eventId}`));
  /** The gentle warnings a change to these times would get. Checks only; nothing is saved. */
  eventConflicts = (familyId: string, eventId: string, startsAt: string, endsAt: string) =>
    this.call(
      this.http.get<{ warnings: CalendarWarning[] }>(`/api/families/${familyId}/calendar/events/${eventId}/conflicts`, {
        params: { startsAt, endsAt },
      }),
    );
  /** Parenting time, holidays and joint events come back PendingApproval with a changeRequestId. */
  createEvent = (familyId: string, event: NewCalendarEvent) =>
    this.call(this.http.post<CalendarEvent>(`/api/families/${familyId}/calendar/events`, event));
  /** 200 when applied at once; 202 when it waits for the other parent (a swap is such a change). */
  updateEvent = (familyId: string, eventId: string, change: CalendarEventChange, scope: EditScope = 'this') =>
    this.call(
      this.http.patch<CalendarEvent>(`/api/families/${familyId}/calendar/events/${eventId}`, change, {
        params: scope === 'this' ? {} : { scope },
      }),
    );
  /** 204 when cancelled at once; 202 with the event when it waits for the other parent. */
  /** Removes a declined request from this parent's own calendar (#199); the co-parent's calendar doesn't change. */
  dismissEvent = (familyId: string, eventId: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/calendar/events/${eventId}/dismiss`, {}));

  cancelEvent = (familyId: string, eventId: string, scope: EditScope = 'this') =>
    this.call(
      this.http.delete<CalendarEvent | null>(`/api/families/${familyId}/calendar/events/${eventId}`, {
        params: scope === 'this' ? {} : { scope },
      }),
    );

  // Shared reminders (parents only). Listing never marks anything seen; opening the details calls reminderSeen.
  reminders = (familyId: string, from: string, to: string) =>
    this.call(this.http.get<Reminder[]>(`/api/families/${familyId}/calendar/reminders`, { params: { from, to } }));
  reminder = (familyId: string, reminderId: string) =>
    this.call(this.http.get<Reminder>(`/api/families/${familyId}/calendar/reminders/${reminderId}`));
  /** On the calendar at once, for both parents: no approval. */
  createReminder = (familyId: string, input: ReminderInput) =>
    this.call(this.http.post<Reminder>(`/api/families/${familyId}/calendar/reminders`, input));
  updateReminder = (familyId: string, reminderId: string, input: ReminderInput) =>
    this.call(this.http.put<Reminder>(`/api/families/${familyId}/calendar/reminders/${reminderId}`, input));
  reminderSeen = (familyId: string, reminderId: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/calendar/reminders/${reminderId}/seen`, {}));
  // Shared tasks (parents only). Listing never marks anything seen; opening the details calls taskSeen.
  tasks = (familyId: string, from: string, to: string) =>
    this.call(this.http.get<SharedTask[]>(`/api/families/${familyId}/calendar/tasks`, { params: { from, to } }));
  task = (familyId: string, taskId: string) =>
    this.call(this.http.get<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}`));
  createTask = (familyId: string, input: TaskInput) =>
    this.call(this.http.post<SharedTask>(`/api/families/${familyId}/calendar/tasks`, input));
  /** 409 when the other parent changed it since `input.version`. */
  updateTask = (familyId: string, taskId: string, input: TaskInput) =>
    this.call(this.http.put<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}`, input));
  taskSeen = (familyId: string, taskId: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/calendar/tasks/${taskId}/seen`, {}));
  /** Mark done (true) or undo it (false). Only for a task without a checklist. */
  setTaskDone = (familyId: string, taskId: string, done: boolean) =>
    this.call(
      done
        ? this.http.post<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}/done`, {})
        : this.http.delete<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}/done`),
    );
  /** Tick (true) or untick (false) a checklist item, as yourself. */
  setTaskItem = (familyId: string, taskId: string, itemId: string, ticked: boolean) =>
    this.call(
      ticked
        ? this.http.post<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}/items/${itemId}/done`, {})
        : this.http.delete<SharedTask>(`/api/families/${familyId}/calendar/tasks/${taskId}/items/${itemId}/done`),
    );
  deleteTask = (familyId: string, taskId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/calendar/tasks/${taskId}`));
  /** Deletes the reminder (every repeat of it) for both parents, at once. */
  deleteReminder = (familyId: string, reminderId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/calendar/reminders/${reminderId}`));

  private call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }
}
