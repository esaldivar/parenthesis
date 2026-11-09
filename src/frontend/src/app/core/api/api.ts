import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, filter, tap } from 'rxjs';

// Hand-written to match the API's OpenAPI document for the endpoints Milestones 1 and 2 use. Generating these from the
// document is planned once the surface grows.

export interface Me {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly language?: 'en' | 'es-419' | null;
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
  /** Persisted membership slot; absent only in older responses/fixtures, displayed neutrally. */
  readonly paletteSlot?: 0 | 1 | null;
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

export type FundCurrency = 'USD' | 'CAD' | 'MXN';

export interface SharedFundDraft {
  readonly title: string;
  readonly childIds: readonly string[];
  readonly currency: FundCurrency;
  readonly proposerShareMinor: number;
  readonly coParentShareMinor: number;
}

export interface SharedFundCreated {
  readonly id: string;
  readonly approvalId: string;
  readonly status: 'AwaitingAgreement' | 'Open' | 'ProposalEnded';
}

export interface SharedFund extends SharedFundCreated, SharedFundDraft {
  readonly proposerId: string;
  /** Reported contributions, newest first (#477). Absent on a proposal that was just sent. */
  readonly entries?: readonly RecordEntry[];
  readonly totals?: RecordTotals;
}

/** Who received a reported payment: a vendor (acknowledged) or the other parent (receipt confirmed). */
export type PaidTo = 'Vendor' | 'CoParent';

/** One reported contribution or Child Support payment, with its attachment kept privately on the server. */
export interface RecordEntry {
  readonly id: string;
  readonly yours: boolean;
  readonly amountMinor: number;
  /** The date the money moved, `YYYY-MM-DD`. */
  readonly paidOn: string;
  readonly paidTo: PaidTo;
  readonly submittedAt: string;
  readonly status: 'Pending' | 'Acknowledged' | 'Disputed';
  readonly respondedAt: string | null;
  readonly attachmentType: string;
  /** This parent is the one who acknowledges it or flags a mismatch. */
  readonly canRespond: boolean;
}

/** Disputed reports never count toward what was acknowledged. */
export interface RecordTotals {
  readonly acknowledgedMinor: number;
  readonly pendingMinor: number;
  readonly disputedMinor: number;
}

/** A one-time Child Support record: a shared copy of payments made through the official channel. */
export interface SupportRecord {
  readonly id: string;
  readonly title: string;
  readonly currency: FundCurrency;
  readonly youPay: boolean;
  readonly referenceMinor: number | null;
  readonly createdAt: string;
  readonly createdByYou: boolean;
  readonly entries: readonly RecordEntry[];
  readonly totals: RecordTotals;
}

export interface SupportDraft {
  readonly title: string;
  readonly currency: FundCurrency;
  readonly youPay: boolean;
  readonly referenceMinor: number | null;
}

/** A report and its required attachment. The request id stays the same on a retry, so it's recorded once. */
export interface ReportDraft {
  readonly amountMinor: number;
  readonly paidOn: string;
  readonly paidTo: PaidTo;
  readonly requestId: string;
  readonly file: File;
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
  /** Whether the child has a PIN, and whether it is paused or locked after wrong tries (#153). */
  readonly signIn: ChildSignIn;
}

export interface CaregiverDetails {
  readonly name: string;
  readonly phone: string;
  readonly city: string | null;
  readonly hourlyRate: number | null;
  readonly schoolPickup: boolean;
}

export interface Caregiver {
  readonly id: string;
  readonly details: CaregiverDetails;
  readonly averageRating: number | null;
  readonly myRating: number | null;
  readonly addedBy: string;
}

export interface CaregiverList {
  readonly version: number;
  readonly caregivers: readonly Caregiver[];
}

export interface EmergencyContact {
  readonly id?: string | null;
  readonly name: string;
  readonly relationship: string;
  readonly phone: string;
  readonly address: string | null;
  readonly callFirst: boolean;
}

export const MEDICAL_PROVIDER_TYPES = ['Doctor', 'Dentist', 'Optometrist', 'Other'] as const;

export interface MedicalProvider {
  readonly id: string;
  readonly type: (typeof MEDICAL_PROVIDER_TYPES)[number];
  readonly name: string;
  readonly specialty: string | null;
  readonly practice: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

export interface MedicalProvidersView {
  readonly revision: number;
  readonly providers: readonly MedicalProvider[];
}

export interface MedicalProvidersHistoryEntry {
  readonly revision: number;
  readonly editedBy: string;
  readonly editedAt: string;
  readonly previous: readonly MedicalProvider[];
  readonly current: readonly MedicalProvider[];
}

export interface EmergencyContactsView {
  readonly version: number;
  readonly contacts: readonly EmergencyContact[];
}

export interface ChildSignIn {
  readonly enabled: boolean;
  /** Needs a parent to choose a new PIN. */
  readonly locked: boolean;
  /** Only for a PIN change requested before #153 made resets immediate. */
  readonly pinChangePending: boolean;
  /** Set while three wrong PINs have paused it; it reopens on its own at this time. */
  readonly pausedUntil?: string | null;
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
  /** A shared device's picker stops working at this fixed time (30 days from setup); null for a child's own tablet. */
  readonly expiresAt?: string | null;
  /** This browser is that device. */
  readonly isThisDevice?: boolean;
}

export interface ProfileTile {
  readonly kind: 'parent' | 'child';
  /** A parent's family membership id, or a child's id. */
  readonly id: string;
  readonly name: string;
  /** A child has a PIN; a parent has a parent PIN (otherwise they use their password). */
  readonly canSignIn: boolean;
  /** The PIN needs resetting. */
  readonly locked: boolean;
  /** Set while the PIN is paused after three wrong tries. */
  readonly pausedUntil?: string | null;
  /** That person's own photo (#388), read with this device's cookie; absent or null shows the initial. */
  readonly photoUrl?: string | null;
}

export interface DeviceProfiles {
  readonly familyName: string;
  readonly deviceKind: DeviceKind;
  readonly profiles: readonly ProfileTile[];
  /** True when the signed-in parent is the one who set up this shared device. */
  readonly isYours?: boolean;
}

/** The signed-in parent's own six-digit PIN for shared devices (#153). */
export interface ParentPinStatus {
  readonly isSet: boolean;
  readonly locked: boolean;
  readonly pausedUntil: string | null;
}

/**
 * A profile photo this viewer may see (#388): a parent's own photo (`kind` "parent", membership id), or, for a parent
 * viewer, their personal photo of a child; for a child viewer, the child's own photo (`kind` "child", child id).
 */
export interface PhotoRef {
  readonly kind: 'parent' | 'child';
  readonly id: string;
  readonly url: string;
}

/** The viewer's photos, and who the viewer is, so their own photo can be found. */
export interface PhotoSet {
  readonly youKind: 'parent' | 'child';
  readonly youId: string;
  readonly photos: readonly PhotoRef[];
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

/** What to search the calendar for (#253). An event matches any of these. */
export interface CalendarSearch {
  readonly q: string | null;
  readonly categories: readonly CalendarCategory[];
  /** Parenting time only: this parent's. */
  readonly caregiver: string | null;
  /** A family-local date, `YYYY-MM-DD`. */
  readonly on: string | null;
}

export interface CalendarSearchPage {
  readonly events: CalendarEvent[];
  readonly hasMore: boolean;
}

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

/** A parent's own one-way copy of the family calendar to Google Calendar (#386). */
export interface GoogleCalendarStatus {
  /** False when the server isn't set up for it: Settings says so and offers nothing. */
  readonly available: boolean;
  readonly state: 'NotConnected' | 'Connected' | 'NeedsReconnect';
  /** Why a stopped copy stopped. */
  readonly problem: 'None' | 'AccessRevoked' | 'CalendarRemoved';
  readonly calendarName: string;
  readonly connectedAt: string | null;
  /** When the last copy finished; null until the first one. */
  readonly lastSyncedAt: string | null;
  /** The kinds of event this parent copies; the defaults until they connect. */
  readonly copyTypes: readonly GoogleCopyType[];
}

/** What a parent can choose to copy: the calendar's categories, with unavailable time split by whose it is. */
export type GoogleCopyType =
  | 'ParentingTime'
  | 'Joint'
  | 'School'
  | 'Medical'
  | 'Dental'
  | 'Activity'
  | 'Birthday'
  | 'Holiday'
  | 'Other'
  | 'MyUnavailable'
  | 'CoParentUnavailable';

/** A parent's own Google Photos connection for exporting Family Memories photos (#404). */
export interface GooglePhotosStatus {
  /** False when the server isn't set up for it: the app says so and offers nothing. */
  readonly available: boolean;
  readonly state: GooglePhotosState;
  /** Why a connection needs reconnecting. */
  readonly problem: 'None' | 'AccessRevoked';
  readonly connectedAt: string | null;
  /** Photos this connection put in the parent's Google Photos. */
  readonly exportedCount: number;
  readonly albumCount: number;
  /** Photos queued or being checked with Google. */
  readonly waitingCount: number;
  /** After connecting: the memory the parent started from. */
  readonly returnEventId: string | null;
}

export type GooglePhotosState = 'NotConnected' | 'Connected' | 'NeedsReconnect';

/** One photo's export to the viewer's own Google Photos. Only `Exported` means Google confirmed it. */
export interface PhotoExport {
  readonly photoId: string;
  readonly state: 'Queued' | 'Checking' | 'Exported' | 'Failed' | 'Skipped';
  readonly reason: PhotoExportReason;
  readonly updatedAt: string;
}

export type PhotoExportReason =
  | 'None'
  | 'Reconnect'
  | 'RateLimited'
  | 'GoogleError'
  | 'StorageFull'
  | 'NotAllowed'
  | 'Deleted'
  | 'Expired';

/**
 * What exporting one memory would do and how far it got, for the viewer only. `exportable`: photos they may download
 * that aren't exported or waiting. `omitted`: photos they can see but not download (never named).
 */
export interface EventExport {
  readonly available: boolean;
  readonly connection: GooglePhotosState;
  readonly albumTitle: string;
  readonly exportable: number;
  readonly exported: number;
  readonly waiting: number;
  readonly omitted: number;
  readonly photos: readonly PhotoExport[];
}

export interface PlaceSuggestions {
  suggestions: string[];
  available: boolean;
}

/** Where the parent is, from their browser, used only to favour nearby suggestions (#414). */
export interface NearbyPosition {
  latitude: number;
  longitude: number;
}

// --- Milestone 3: event photos and Family Memories (#403) --------------------------------------------------------------

/** One photo the viewer may see. `downloadUrl` is null when they may view it but not download it. */
export interface EventPhoto {
  readonly id: string;
  readonly position: number;
  readonly width: number;
  readonly height: number;
  readonly expiresAt: string;
  readonly thumbnailUrl: string;
  readonly url: string;
  readonly downloadUrl: string | null;
}

/**
 * One parent's photos from one upload. The co-parent's batches appear only while shared; `downloadsAllowed` says
 * whether their uploader allows the co-parent to download them.
 */
export interface PhotoBatch {
  readonly id: string;
  readonly yours: boolean;
  readonly visibleToCoParent: boolean;
  readonly downloadsAllowed: boolean;
  readonly createdAt: string;
  readonly photos: readonly EventPhoto[];
}

/** Why this event can't take the viewer's photos now. The server enforces it; the app only explains. */
export type PhotoUploadBlock = 'not-confirmed' | 'unavailable-time' | 'not-caregiver' | 'not-started' | 'window-closed';

export interface PhotoUploads {
  /** False while uploads are switched off on this site. */
  readonly available: boolean;
  readonly blocked: PhotoUploadBlock | null;
  readonly cap: number;
  readonly used: number;
  readonly remaining: number;
  readonly storageUsedBytes: number;
  readonly storageLimitBytes: number;
  readonly maxPerUpload: number;
  readonly maxFileBytes: number;
}

export interface EventPhotos {
  readonly eventId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly allDay: boolean;
  readonly cancelled: boolean;
  readonly uploads: PhotoUploads;
  readonly batches: readonly PhotoBatch[];
  /** When the last photos the viewer could see were deleted, if they all have been. */
  readonly photosDeletedOn: string | null;
  readonly downloadAll: DownloadAll;
}

/**
 * What "Download all" would include: the photos the viewer may download now, their approximate size, and how many
 * they can see but not download. `url` streams them as one ZIP; it's null when there's nothing to download.
 */
export interface DownloadAll {
  readonly photoCount: number;
  readonly bytes: number;
  readonly omitted: number;
  readonly url: string | null;
}

/** A Family Memory: one event with photos the viewer may see. `expiresAt` is when its first photo goes. */
export interface Memory {
  readonly eventId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly allDay: boolean;
  readonly cancelled: boolean;
  readonly photoCount: number;
  readonly yourPhotoCount: number;
  readonly sharedWithYouCount: number;
  readonly expiresAt: string;
  readonly coverThumbnailUrl: string;
}

export interface MemorySettings {
  readonly allowCoParentDownload: boolean;
  readonly storageUsedBytes: number;
  readonly storageLimitBytes: number;
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
  /**
   * Unavailable time, activities and parenting time (#193, #239): every `interval` days, weeks (on `days`) or months
   * (#238), ending on `until` or after `count` times. Repeating parenting time goes to the co-parent as one request
   * for every date; holidays and family events don't repeat.
   */
  readonly repeat?: {
    readonly frequency: SeriesFrequency;
    readonly interval: number;
    readonly days: readonly Weekday[];
    readonly until?: string;
    readonly count?: number;
  };
}

/** How often a series repeats (#238). */
export type SeriesFrequency = 'Daily' | 'Weekly' | 'Monthly';

/** Weekdays as the API names them (#193). */
export type Weekday = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

/** How a repeating event repeats. */
export interface EventRepeat {
  readonly frequency: SeriesFrequency;
  /** Every this many days, weeks or months. */
  readonly interval: number;
  /** A weekly repeat's days; empty for daily and monthly. */
  readonly days: readonly Weekday[];
  /** `YYYY-MM-DD`, inclusive. */
  readonly until: string | null;
  readonly count: number | null;
  /** How many dates the series has, cancelled ones aside (#239). */
  readonly dateCount?: number;
  /** When its first few dates start, in order (#239). */
  readonly firstStarts?: readonly string[];
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

// --- Milestone 4 (#125, ADR-0008): the parents' conversation ---------------------------------------------------------

/** A message as both parents see it. `yours`: the viewer sent it. `clientMessageId` matches the sender's pending copy. */
export interface ChatMessage {
  readonly id: string;
  readonly clientMessageId: string;
  readonly senderMembershipId: string;
  readonly yours: boolean;
  /** Empty when the message only shares an event. */
  readonly text: string;
  readonly sentAt: string;
  /** A calendar event shared with the message (slice 2). */
  readonly eventId?: string | null;
  /** Its card as this parent's calendar shows it. Live pushes leave it out: read the message to get it. */
  readonly event?: ChatEventCard | null;
}

/** Confirmed, or still a proposal or declined: a card never makes a proposal look confirmed. */
export type SharedEventStatus = 'Confirmed' | 'Proposed' | 'Declined';

/**
 * A shared event's card. `available` is false once this parent's calendar no longer shows it (cancelled, or a
 * declined request they removed); then only its id is known.
 */
export interface ChatEventCard {
  readonly id: string;
  readonly available: boolean;
  readonly title?: string | null;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly allDay?: boolean;
  readonly status?: SharedEventStatus | null;
  readonly changePending?: boolean;
}

/** A transcript's dates: both null for all messages, otherwise family-local `YYYY-MM-DD`, both included. */
export interface TranscriptRange {
  readonly from: string | null;
  readonly to: string | null;
}

/** One message as the transcript shows it: family-local time, sender's name, and a shared event's description. */
export interface TranscriptMessage {
  readonly time: string;
  readonly sender: string;
  readonly yours: boolean;
  readonly text: string;
  readonly event: string | null;
}

/** Exactly what the PDF holds, for the preview. An empty range has no days. */
export interface TranscriptPreview {
  readonly fileName: string;
  readonly title: string;
  readonly rangeLabel: string;
  readonly timeZone: string;
  readonly preparedLabel: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly messageCount: number;
  readonly days: readonly { readonly date: string; readonly label: string; readonly messages: readonly TranscriptMessage[] }[];
}

/** A transcript this parent saved: only they can see or open it. */
export interface SavedTranscript {
  readonly id: string;
  readonly fileName: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly rangeLabel: string;
  readonly messageCount: number;
  readonly createdAt: string;
}

/** A page of the conversation, oldest first, with each parent's latest read message (null when none). */
export interface ChatConversation {
  readonly yourMembershipId: string;
  readonly messages: readonly ChatMessage[];
  readonly hasOlder: boolean;
  readonly yourReadThrough: string | null;
  readonly coParentReadThrough: string | null;
}

/** `count` stops at 99. */
/** A shared Child Essentials section, as the update notices (#128) name it. */
export type EssentialsSectionId =
  | 'school'
  | 'allergiesFood'
  | 'clothing'
  | 'whatHelps'
  | 'routines'
  | 'householdRoutines'
  | 'emergencyContacts'
  | 'caregivers'
  | 'medical';

/** A child's section with an update this parent hasn't looked at: its dot, and the changed rows not yet seen. */
export interface EssentialsSectionUpdates {
  readonly childId: string;
  readonly section: EssentialsSectionId;
  readonly unopened: boolean;
  readonly rows: readonly string[];
}

/** This parent's Child Essentials indicators: the navigation dot, then each section's dot and rows. */
export interface EssentialsUpdates {
  readonly newUpdates: boolean;
  readonly sections: readonly EssentialsSectionUpdates[];
}

/** One banner: a child's section, and the fields changed there since the parent last opened Child Essentials. */
export interface EssentialsBanner {
  readonly childId: string;
  readonly section: EssentialsSectionId;
  readonly fields: readonly string[];
}

export interface ChatUnread {
  readonly count: number;
  readonly hasUnread: boolean;
}

export interface ClothingValues {
  readonly topSize: string | null;
  readonly bottomSize: string | null;
  readonly shoeSize: string | null;
  readonly fitNotes: string | null;
}

export interface ClothingView {
  readonly revision: number;
  readonly values: ClothingValues;
}

export interface ClothingHistoryPage {
  readonly entries: readonly {
    readonly revision: number;
    readonly editedBy: string;
    readonly editedAt: string;
    readonly previous: ClothingValues;
    readonly current: ClothingValues;
  }[];
  readonly beforeRevision: number | null;
}

export interface WhatHelpsValues {
  readonly comfortItems: string | null;
  readonly calmingStrategies: string | null;
}

export interface WhatHelpsView {
  readonly revision: number;
  readonly values: WhatHelpsValues;
}

export interface WhatHelpsHistoryPage {
  readonly entries: readonly {
    readonly revision: number;
    readonly editedBy: string;
    readonly editedAt: string;
    readonly previous: WhatHelpsValues;
    readonly current: WhatHelpsValues;
  }[];
  readonly beforeRevision: number | null;
}

export interface HouseholdRoutine {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isMine: boolean;
  readonly latest: RoutinesView;
  readonly shared: RoutinesView | null;
  readonly canAccept: boolean;
}

export interface RoutinesValues {
  readonly bedtime: string | null;
  readonly naps: string | null;
}

export interface RoutinesView {
  readonly revision: number;
  readonly values: RoutinesValues;
}

export interface RoutinesHistoryPage {
  readonly entries: readonly {
    readonly revision: number;
    readonly editedBy: string;
    readonly editedAt: string;
    readonly previous: RoutinesValues;
    readonly current: RoutinesValues;
  }[];
  readonly beforeRevision: number | null;
}

export interface AllergiesFoodValues {
  readonly noKnownAllergies: boolean;
  readonly allergies: string | null;
  readonly foodPreferences: string | null;
}

export interface AllergiesFoodView {
  readonly revision: number;
  readonly values: AllergiesFoodValues;
  readonly recordedBy?: string | null;
  readonly recordedAt?: string | null;
}

export interface AllergiesFoodHistoryPage {
  readonly entries: readonly {
    readonly revision: number;
    readonly editedBy: string;
    readonly editedAt: string;
    readonly previous: AllergiesFoodValues;
    readonly current: AllergiesFoodValues;
  }[];
  readonly beforeRevision: number | null;
}

export interface SchoolValues {
  readonly homeroomTeacher: string | null;
  readonly grade: string | null;
  readonly parentConcerns: string | null;
}

export interface SchoolView {
  readonly revision: number;
  readonly values: SchoolValues;
}

export interface SchoolHistoryPage {
  readonly entries: readonly {
    readonly revision: number;
    readonly editedBy: string;
    readonly editedAt: string;
    readonly previous: SchoolValues;
    readonly current: SchoolValues;
  }[];
  readonly beforeRevision: number | null;
}

export interface NotificationItem {
  id: string;
  kind: 'Added' | 'Updated' | 'Cancelled';
  createdAt: string;
  seen: boolean;
  eventId: string | null;
  eventDate: string | null;
}

/** Thin, typed wrappers over the /api endpoints. Relative URLs, so Angular attaches the X-XSRF-TOKEN header. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  antiforgery = () => this.call(this.http.get<void>('/api/antiforgery'));
  me = () => this.call(this.http.get<Me>('/api/me'));
  setLanguage = (language: 'en' | 'es-419') => this.call(this.http.put<Me>('/api/me/language', { language }));

  register = (body: { email: string; password: string; displayName: string; language?: 'en' | 'es-419' }) =>
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

  clothing = (familyId: string, childId: string) =>
    this.call(this.http.get<ClothingView>(this.clothingUrl(familyId, childId)));
  saveClothing = (familyId: string, childId: string, body: ClothingView) =>
    this.call(this.http.put<ClothingView>(this.clothingUrl(familyId, childId), body));
  clothingHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<ClothingHistoryPage>(this.clothingUrl(familyId, childId) + '/history', {
      params: beforeRevision === null ? {} : { beforeRevision },
    }));

  private clothingUrl(familyId: string, childId: string): string {
    return `/api/families/${familyId}/children/${childId}/essentials/clothing`;
  }

  whatHelps = (familyId: string, childId: string) =>
    this.call(this.http.get<WhatHelpsView>(this.whatHelpsUrl(familyId, childId)));
  saveWhatHelps = (familyId: string, childId: string, body: WhatHelpsView) =>
    this.call(this.http.put<WhatHelpsView>(this.whatHelpsUrl(familyId, childId), body));
  whatHelpsHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<WhatHelpsHistoryPage>(this.whatHelpsUrl(familyId, childId) + '/history', {
      params: beforeRevision === null ? {} : { beforeRevision },
    }));

  private whatHelpsUrl(familyId: string, childId: string): string {
    return `/api/families/${familyId}/children/${childId}/essentials/what-helps`;
  }

  routines = (familyId: string, childId: string) =>
    this.call(this.http.get<RoutinesView>(this.routinesUrl(familyId, childId)));
  saveRoutines = (familyId: string, childId: string, body: RoutinesView) =>
    this.call(this.http.put<RoutinesView>(this.routinesUrl(familyId, childId), body));
  routinesHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<RoutinesHistoryPage>(this.routinesUrl(familyId, childId) + '/history', {
      params: beforeRevision === null ? {} : { beforeRevision },
    }));

  householdRoutines = (familyId: string, childId: string) =>
    this.call(this.http.get<readonly HouseholdRoutine[]>(this.routinesUrl(familyId, childId) + '/households'));
  updateHouseholdRoutine = (familyId: string, childId: string, ownerId: string,
    body: { revision: number; action: 'save' | 'accept' | 'stop'; values?: RoutinesValues }) =>
    this.call(this.http.put<RoutinesView>(this.routinesUrl(familyId, childId) + '/households/' + encodeURIComponent(ownerId), body));

  private routinesUrl(familyId: string, childId: string): string {
    return `/api/families/${familyId}/children/${childId}/essentials/routines`;
  }

  caregivers = (familyId: string, childId: string) =>
    this.call(this.http.get<CaregiverList>(this.caregiversUrl(familyId, childId)));
  saveCaregiver = (familyId: string, childId: string, id: string | null,
    body: { version: number; details: CaregiverDetails; allowDuplicate: boolean }) =>
    this.call(id ? this.http.put<void>(this.caregiversUrl(familyId, childId) + '/' + encodeURIComponent(id), body)
      : this.http.post<void>(this.caregiversUrl(familyId, childId), body));
  removeCaregiver = (familyId: string, childId: string, id: string, version: number) =>
    this.call(this.http.delete<void>(this.caregiversUrl(familyId, childId) + '/' + encodeURIComponent(id), { params: { version } }));
  rateCaregiver = (familyId: string, childId: string, id: string, rating: number | null) =>
    this.call(this.http.put<void>(this.caregiversUrl(familyId, childId) + '/' + encodeURIComponent(id) + '/rating', { rating }));

  private caregiversUrl(familyId: string, childId: string): string {
    return `/api/families/${encodeURIComponent(familyId)}/children/${encodeURIComponent(childId)}/essentials/caregivers`;
  }

  medicalProviders = (familyId: string, childId: string) =>
    this.call(this.http.get<MedicalProvidersView>(this.medicalProvidersUrl(familyId, childId)));

  saveMedicalProviders = (familyId: string, childId: string, body: MedicalProvidersView) =>
    this.call(this.http.put<MedicalProvidersView>(this.medicalProvidersUrl(familyId, childId), body));

  addMedicalProvider = (familyId: string, childId: string, provider: MedicalProvider, childIds: readonly string[]) =>
    this.call(this.http.post<MedicalProvidersView>(this.medicalProvidersUrl(familyId, childId), { provider, childIds }));

  medicalProvidersHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<{ entries: readonly MedicalProvidersHistoryEntry[]; beforeRevision: number | null }>(
      this.medicalProvidersUrl(familyId, childId) + '/history',
      { params: beforeRevision === null ? {} : { beforeRevision } },
    ));

  private medicalProvidersUrl(familyId: string, childId: string): string {
    return `/api/families/${encodeURIComponent(familyId)}/children/${encodeURIComponent(childId)}/essentials/medical`;
  }

  emergencyContacts = (familyId: string, childId: string) =>
    this.call(this.http.get<EmergencyContactsView>(this.emergencyContactsUrl(familyId, childId)));
  saveEmergencyContacts = (familyId: string, childId: string, body: EmergencyContactsView) =>
    this.call(this.http.put<EmergencyContactsView>(this.emergencyContactsUrl(familyId, childId), body));

  private emergencyContactsUrl(familyId: string, childId: string): string {
    return `/api/families/${encodeURIComponent(familyId)}/children/${encodeURIComponent(childId)}/essentials/emergency-contacts`;
  }

  /** The allergy PDF and the dated file name the server gave it ("allergies-2026-11-07.pdf"). */
  downloadAllergyPdf = async (familyId: string, childId: string | null) => {
    const response = await this.call(
      this.http.get(`/api/families/${encodeURIComponent(familyId)}/child-essentials/allergies/pdf`, {
        responseType: 'blob',
        observe: 'response',
        params: childId ? { childId } : {},
      }),
    );
    return { pdf: response.body ?? new Blob(), fileName: attachmentName(response.headers.get('Content-Disposition')) ?? 'allergies.pdf' };
  };

  allergiesFood = (familyId: string, childId: string) =>
    this.call(this.http.get<AllergiesFoodView>(this.allergiesFoodUrl(familyId, childId)));
  saveAllergiesFood = (familyId: string, childId: string, body: AllergiesFoodView) =>
    this.call(this.http.put<AllergiesFoodView>(this.allergiesFoodUrl(familyId, childId), body));
  allergiesFoodHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<AllergiesFoodHistoryPage>(this.allergiesFoodUrl(familyId, childId) + '/history', {
      params: beforeRevision === null ? {} : { beforeRevision },
    }));

  private allergiesFoodUrl(familyId: string, childId: string): string {
    return `/api/families/${familyId}/children/${childId}/essentials/allergies-food`;
  }

  school = (familyId: string, childId: string) =>
    this.call(this.http.get<SchoolView>(this.schoolUrl(familyId, childId)));
  saveSchool = (familyId: string, childId: string, body: SchoolView) =>
    this.call(this.http.put<SchoolView>(this.schoolUrl(familyId, childId), body));
  schoolHistory = (familyId: string, childId: string, beforeRevision: number | null) =>
    this.call(this.http.get<SchoolHistoryPage>(this.schoolUrl(familyId, childId) + '/history', {
      params: beforeRevision === null ? {} : { beforeRevision },
    }));

  private schoolUrl(familyId: string, childId: string): string {
    return `/api/families/${familyId}/children/${childId}/essentials/school`;
  }

  sharedFunds = (familyId: string) =>
    this.call(this.http.get<SharedFund[]>(`/api/families/${familyId}/shared-funds`));
  proposeSharedFund = (familyId: string, proposal: SharedFundDraft) =>
    this.call(this.http.post<SharedFundCreated>(`/api/families/${familyId}/shared-funds`, proposal));
  childSupport = (familyId: string) =>
    this.call(this.http.get<SupportRecord[]>(`/api/families/${familyId}/child-support`));
  createChildSupport = (familyId: string, draft: SupportDraft) =>
    this.call(this.http.post<SupportRecord>(`/api/families/${familyId}/child-support`, draft));
  reportContribution = (familyId: string, fundId: string, report: ReportDraft) =>
    this.sendReport(`/api/families/${familyId}/shared-funds/${fundId}/contributions`, report);
  reportSupportPayment = (familyId: string, recordId: string, report: ReportDraft) =>
    this.sendReport(`/api/families/${familyId}/child-support/${recordId}/payments`, report);
  respondToEntry = (familyId: string, entryId: string, response: 'acknowledge' | 'dispute') =>
    this.call(this.http.post<RecordEntry>(`/api/families/${familyId}/shared-records/entries/${entryId}/${response}`, {}));
  /** Whether payment attachments can be saved at all; until they can, no report can be sent. */
  sharedRecordsAttachmentStorage = (familyId: string) =>
    this.call(this.http.get<{ ready: boolean }>(`/api/families/${familyId}/shared-records/attachment-storage`));
  sharedRecordsAttention = (familyId: string) =>
    this.call(this.http.get<{ count: number }>(`/api/families/${familyId}/shared-records/attention`));
  /** Same-origin link to a report's attachment; the server checks the parent's access on every read. */
  entryAttachmentUrl = (familyId: string, entryId: string) =>
    `/api/families/${familyId}/shared-records/entries/${entryId}/attachment`;

  /** The file is the request body; the report's details travel in the query, so nothing is recorded without it. */
  private sendReport(path: string, report: ReportDraft) {
    const params: Record<string, string> = {
      amountMinor: String(report.amountMinor), paidOn: report.paidOn, paidTo: report.paidTo, requestId: report.requestId,
    };
    return this.call(this.http.post<RecordEntry>(path, report.file, {
      params, headers: { 'Content-Type': report.file.type || 'application/octet-stream' },
    }));
  }

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
  /** Sets a child's first PIN, or resets it at once (clearing any pause or lock); the other parent is told (#153). */
  setChildPin = (familyId: string, childId: string, pin: string) =>
    this.call(this.http.put<void>(`/api/families/${familyId}/children/${childId}/pin`, { pin }));
  disableChildSignIn = (familyId: string, childId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/children/${childId}/pin`));
  pairingCode = (familyId: string, childId: string) =>
    this.call(this.http.post<{ code: string; expiresAt: string }>(`/api/families/${familyId}/children/${childId}/pairing-code`, {}));

  // Devices.
  devices = (familyId: string) => this.call(this.http.get<Device[]>(`/api/families/${familyId}/devices`));
  /** "Yes, this is a shared family device": registers it for 30 days, creating the parent PIN when there's none yet. */
  setUpSharedDevice = (familyId: string, name: string, pin: string | null) =>
    this.call(this.http.post<Device>(`/api/families/${familyId}/devices/household`, { name, pin }));
  parentPinStatus = (familyId: string) => this.call(this.http.get<ParentPinStatus>(`/api/families/${familyId}/parent-pin`));
  setParentPin = (familyId: string, currentPassword: string, pin: string) =>
    this.call(this.http.put<void>(`/api/families/${familyId}/parent-pin`, { currentPassword, pin }));
  removeDevice = (familyId: string, deviceId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/devices/${deviceId}`));

  // The profile picker on a registered device. After a child signs in, or a parent signs back in, fetch a fresh
  // antiforgery token: tokens are tied to who is signed in.
  deviceProfiles = () => this.call(this.http.get<DeviceProfiles>('/api/device/profiles'));
  childSignIn = (childId: string, pin: string) =>
    this.call(this.http.post<void>('/api/device/child-session', { childId, pin }));
  /** The parent who set up this shared device enters their profile with their six-digit PIN. */
  parentPinSignIn = (membershipId: string, pin: string) =>
    this.call(this.http.post<void>('/api/device/parent-session', { membershipId, pin }));
  /** "Forgot your PIN?": emails the device's parent a single-use, 15-minute reset link (at most one per 15 minutes). */
  requestParentPinReset = (membershipId: string) =>
    this.call(this.http.post<{ notified: boolean }>('/api/device/parent-pin-reset', { membershipId }));
  /** Checks a reset link without using it up. */
  checkParentPinReset = (familyId: string, token: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/parent-pin/reset/check`, { token }));
  /** Uses a reset link: the signed-in parent it was sent to confirms their password and chooses a new PIN. */
  redeemParentPinReset = (familyId: string, token: string, currentPassword: string, pin: string) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/parent-pin/reset`, { token, currentPassword, pin }));
  /** Ends whoever is signed in here and keeps the shared device's picker. */
  switchProfile = () => this.call(this.http.post<void>('/api/device/switch', {}));
  pairDevice = (code: string, deviceName: string) =>
    this.call(this.http.post<{ childId: string; childFirstName: string }>('/api/device/pair', { code, deviceName }));
  childSession = () => this.call(this.http.get<ChildSession>('/api/session/child'));

  // Profile photos (#388). Each person changes only their own choices; uploads are the raw image file.
  photos = (familyId: string) => this.call(this.http.get<PhotoSet>(`/api/families/${familyId}/photos`));
  /** The viewer's own photo: a parent's, or a signed-in child's. */
  setOwnPhoto = (familyId: string, file: Blob) =>
    this.call(this.http.put<PhotoRef>(`/api/families/${familyId}/photos/me`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
  removeOwnPhoto = (familyId: string) => this.call(this.http.delete<void>(`/api/families/${familyId}/photos/me`));
  /** This parent's personal photo of a child, seen only by them. */
  setChildPhoto = (familyId: string, childId: string, file: Blob) =>
    this.call(
      this.http.put<PhotoRef>(`/api/families/${familyId}/photos/children/${childId}`, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      }),
    );
  removeChildPhoto = (familyId: string, childId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/photos/children/${childId}`));

  // Event photos and Family Memories (#403). Parents only; every rule is checked on the server.
  memories = (familyId: string) => this.call(this.http.get<Memory[]>(`/api/families/${familyId}/memories`));
  /** This parent's Google Photos connection (#404). Parents only; it never changes the co-parent's. */
  googlePhotos = (familyId: string) =>
    this.call(this.http.get<GooglePhotosStatus>(`/api/families/${familyId}/memories/google-photos`));
  /** Google's consent page; `returnEventId` brings the parent back to that memory afterwards. */
  googlePhotosAuthorize = (familyId: string, returnEventId?: string) =>
    this.call(
      this.http.post<{ url: string }>(`/api/families/${familyId}/memories/google-photos/authorize`, {
        returnEventId: returnEventId ?? null,
      }),
    );
  googlePhotosConnect = (familyId: string, code: string, state: string) =>
    this.call(this.http.post<GooglePhotosStatus>(`/api/families/${familyId}/memories/google-photos/connect`, { code, state }));
  /** Revokes access and forgets albums and export marks; what's already in Google stays there. */
  googlePhotosDisconnect = (familyId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/memories/google-photos`));
  /** What exporting this memory would include, and each photo's export so far. */
  eventExport = (familyId: string, eventId: string) =>
    this.call(this.http.get<EventExport>(`/api/families/${familyId}/memories/events/${eventId}/google-photos`));
  /** Queues the named photos, or every photo the viewer may download; the server skips the rest. */
  exportToGooglePhotos = (familyId: string, eventId: string, photoIds?: readonly string[]) =>
    this.call(
      this.http.post<EventExport>(`/api/families/${familyId}/memories/events/${eventId}/google-photos`, {
        photoIds: photoIds ?? null,
      }),
    );
  eventPhotos = (familyId: string, eventId: string) =>
    this.call(this.http.get<EventPhotos>(`/api/families/${familyId}/memories/events/${eventId}`));
  /** Adds one photo (the raw file) to the viewer's batch, or starts a batch when `batchId` is missing. */
  addEventPhoto = (familyId: string, eventId: string, file: Blob, batchId?: string,
    onProgress?: (percent: number | null) => void) =>
    this.call(
      this.http.post<{ batchId: string; photo: EventPhoto }>(`/api/families/${familyId}/memories/events/${eventId}/photos`, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        params: batchId ? { batchId } : {},
        observe: 'events',
        reportProgress: true,
      }).pipe(
        tap((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            onProgress?.(event.total ? Math.min(100, event.loaded / event.total * 100) : null);
          }
        }),
        filter((event) => event.type === HttpEventType.Response),
      ),
    ).then((response) => response.body!);
  /** Turns "Visible to Co-Parent" on or off for one of the viewer's batches. */
  shareBatch = (familyId: string, batchId: string, visibleToCoParent: boolean) =>
    this.call(this.http.patch<void>(`/api/families/${familyId}/memories/batches/${batchId}`, { visibleToCoParent }));
  deleteEventPhoto = (familyId: string, photoId: string) =>
    this.call(this.http.delete<void>(`/api/families/${familyId}/memories/photos/${photoId}`));
  memorySettings = (familyId: string) => this.call(this.http.get<MemorySettings>(`/api/families/${familyId}/memories/settings`));
  saveMemorySettings = (familyId: string, allowCoParentDownload: boolean) =>
    this.call(this.http.put<MemorySettings>(`/api/families/${familyId}/memories/settings`, { allowCoParentDownload }));

  // The shared calendar. A range spans at most 62 days. Children may list (they see only their confirmed events).
  calendarEvents = (familyId: string, from: string, to: string) =>
    this.call(this.http.get<CalendarEvent[]>(`/api/families/${familyId}/calendar/events`, { params: { from, to } }));
  /**
   * Searches the whole calendar (#253): one page of upcoming and ongoing events (soonest first), or of past events (most
   * recent first). Matches the title, any of the categories (parenting time only for the caregiver, when given) or
   * events on a family-local date. The server applies the same visibility as the calendar.
   */
  searchCalendarEvents = (familyId: string, search: CalendarSearch, page: { past: boolean; offset: number; limit: number }) => {
    const params: Record<string, string | string[]> = { past: String(page.past), offset: String(page.offset), limit: String(page.limit) };
    if (search.q) params['q'] = search.q;
    if (search.categories.length) params['category'] = [...search.categories];
    if (search.caregiver) params['caregiver'] = search.caregiver;
    if (search.on) params['on'] = search.on;
    return this.call(this.http.get<CalendarSearchPage>(`/api/families/${familyId}/calendar/events/search`, { params }));
  };
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
  /**
   * Address suggestions for a location (#354). The server asks Google, so the key never reaches the browser.
   * `available: false` means off, used up for today, or Google didn't answer: stop asking for this field.
   * `near` is the parent's own position, sent only after they pressed "Use my location" (#414); the server rounds it
   * and never stores it.
   */
  placeSuggestions = (familyId: string, input: string, sessionToken: string, near: NearbyPosition | null = null) =>
    this.call(
      this.http.post<PlaceSuggestions>(`/api/families/${familyId}/calendar/place-suggestions`, {
        input,
        sessionToken,
        ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}),
      }),
    );
  /** Whether suggestions are on, without asking Google or using up the daily allowance (#414). */
  placeSuggestionsStatus = (familyId: string) =>
    this.call(this.http.get<PlaceSuggestions>(`/api/families/${familyId}/calendar/place-suggestions`));
  /** This parent's Google Calendar copy (#386). Parents only; it never changes the co-parent's or children's settings. */
  googleCalendar = (familyId: string) => this.call(this.http.get<GoogleCalendarStatus>(`/api/families/${familyId}/google-calendar`));
  /** Google's consent page for this parent, with a state that only works for them, for ten minutes. */
  googleCalendarAuthorize = (familyId: string) =>
    this.call(this.http.post<{ url: string }>(`/api/families/${familyId}/google-calendar/authorize`, {}));
  /** Finishes connecting with what Google added to the callback URL. */
  googleCalendarConnect = (familyId: string, code: string, state: string) =>
    this.call(this.http.post<GoogleCalendarStatus>(`/api/families/${familyId}/google-calendar/connect`, { code, state }));
  /** Stops the copy, removes the "Parenthesis Family" calendar from Google and forgets the access. */
  /** Chooses what this parent copies; events no longer chosen leave their Google calendar within a minute or two. */
  googleCalendarCopyTypes = (familyId: string, copyTypes: readonly GoogleCopyType[]) =>
    this.call(this.http.put<GoogleCalendarStatus>(`/api/families/${familyId}/google-calendar/copy-types`, { copyTypes }));
  googleCalendarDisconnect = (familyId: string) => this.call(this.http.delete<void>(`/api/families/${familyId}/google-calendar`));
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
  /** A separate dates-only proposal; generic editing of the other parent's time is prohibited (#260). */
  requestSwap = (familyId: string, eventId: string, change: Pick<CalendarEventChange, 'startsAt' | 'endsAt' | 'allDay' | 'reason'>) =>
    this.call(this.http.post<CalendarEvent>(`/api/families/${familyId}/calendar/events/${eventId}/swap`, change));
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

  // The parents' conversation (#125). Children never reach it.
  /** The latest page, or the page before `before` (a message id). */
  conversation = (familyId: string, before?: string) =>
    this.call(this.http.get<ChatConversation>(`/api/families/${familyId}/chat`, { params: before ? { before } : {} }));
  /** Idempotent per `clientMessageId`: retrying returns the stored message instead of a second copy. */
  /** `eventId` shares an event from the sender's calendar; then `text` may be empty. */
  sendMessage = (familyId: string, clientMessageId: string, text: string, eventId?: string | null) =>
    this.call(
      this.http.post<ChatMessage>(`/api/families/${familyId}/chat/messages`, { clientMessageId, text, eventId: eventId ?? null }),
    );
  /** One message as this parent sees it, with its event card. */
  chatMessage = (familyId: string, messageId: string) =>
    this.call(this.http.get<ChatMessage>(`/api/families/${familyId}/chat/messages/${messageId}`));
  /** Only for a message seen in an open, visible conversation. Moving back changes nothing. */
  markRead = (familyId: string, messageId: string) =>
    this.call(this.http.put<void>(`/api/families/${familyId}/chat/read`, { messageId }));
  // Transcripts (slice 3): previews and downloads are made on request; saved ones are this parent's alone.
  transcriptPreview = (familyId: string, range: TranscriptRange) =>
    this.call(this.http.get<TranscriptPreview>(`/api/families/${familyId}/chat/transcripts/preview`, { params: rangeParams(range) }));
  saveTranscript = (familyId: string, range: TranscriptRange) =>
    this.call(this.http.post<SavedTranscript>(`/api/families/${familyId}/chat/transcripts`, range));
  transcripts = (familyId: string) => this.call(this.http.get<SavedTranscript[]>(`/api/families/${familyId}/chat/transcripts`));
  /** The range as a PDF (opened in the browser, or saved to the device with `download`). Same-origin, so the session cookie applies. */
  transcriptPdfUrl = (familyId: string, range: TranscriptRange, download: boolean) => {
    const params = new URLSearchParams(rangeParams(range));
    if (download) params.set('download', 'true');
    const query = params.toString();
    return `/api/families/${familyId}/chat/transcripts/pdf${query ? `?${query}` : ''}`;
  };
  savedTranscriptUrl = (familyId: string, transcriptId: string, download = false) =>
    `/api/families/${familyId}/chat/transcripts/${transcriptId}/pdf${download ? '?download=true' : ''}`;
  notifications = (familyId: string, offset: number) =>
    this.call(this.http.get<{ items: NotificationItem[]; hasMore: boolean }>(`/api/families/${familyId}/notifications?offset=${offset}`));
  notificationsUnseen = (familyId: string) =>
    this.call(this.http.get<{ unseen: boolean }>(`/api/families/${familyId}/notifications/unseen`));
  markNotificationsSeen = (familyId: string, ids: string[]) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/notifications/seen`, { ids }));

  // Child Essentials update indicators (#128): identifiers only, never values.
  essentialsUpdates = (familyId: string) =>
    this.call(this.http.get<EssentialsUpdates>(`/api/families/${familyId}/essentials/updates`));
  essentialsOpened = (familyId: string) =>
    this.call(this.http.post<EssentialsBanner[]>(`/api/families/${familyId}/essentials/updates/opened`, {}));
  essentialsSectionOpened = (familyId: string, childId: string, section: EssentialsSectionId) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/essentials/updates/sections`, { childId, section }));
  essentialsRowsSeen = (familyId: string, childId: string, section: EssentialsSectionId, fields: readonly string[]) =>
    this.call(this.http.post<void>(`/api/families/${familyId}/essentials/updates/rows`, { childId, section, fields }));
  chatUnread = (familyId: string) => this.call(this.http.get<ChatUnread>(`/api/families/${familyId}/chat/unread`));
  typing = (familyId: string) => this.call(this.http.post<void>(`/api/families/${familyId}/chat/typing`, {}));

  private call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }
}

/** The file name in a Content-Disposition header (the RFC 5987 `filename*` form first), or null. */
export function attachmentName(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* fall back to the plain form */
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name ? name : null;
}

function rangeParams(range: TranscriptRange): Record<string, string> {
  return range.from && range.to ? { from: range.from, to: range.to } : {};
}
