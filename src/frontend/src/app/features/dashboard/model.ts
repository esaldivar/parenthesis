// Shapes the dashboard needs. There are no calendar, approval, child-profile or memory endpoints yet
// (Milestone 2+); these types are the contract a future API should satisfy, and today they are only filled by the
// development-only sample data.

/** A calendar date in the family's time zone, "YYYY-MM-DD". */
export type PlainDate = string;

/** A wall-clock time in the family's time zone, "YYYY-MM-DDTHH:mm". */
export type LocalDateTime = string;

export interface ChildRef {
  readonly id: string;
  /** First name or nickname (minimal child PII, per the architecture). */
  readonly name: string;
}

export interface Caregiver {
  readonly membershipId: string;
  readonly displayName: string;
}

/**
 * Text-first statuses (never colour alone). "change-pending" means a confirmed arrangement with an open proposal:
 * it stays in force until both parents approve the change.
 */
export type ScheduleStatus = 'confirmed' | 'proposed' | 'rejected';

/** One child's parenting time with one caregiver. Grouping for display never changes these. */
export interface ParentingTime {
  readonly id: string;
  readonly child: ChildRef;
  readonly caregiver: Caregiver;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
  readonly status: ScheduleStatus;
  /** A confirmed arrangement that has a proposed change awaiting approval. */
  readonly changePending?: boolean;
}

export interface FamilyEvent {
  readonly id: string;
  readonly title: string;
  readonly date: PlainDate;
  /** "HH:mm"; absent for all-day events. */
  readonly time?: string;
  readonly children: readonly ChildRef[];
  readonly status: ScheduleStatus;
}

export interface PendingReview {
  readonly id: string;
  readonly summary: string;
  readonly proposedBy: string;
}

export interface SharedMemory {
  readonly id: string;
  readonly title: string;
  readonly sharedBy: string;
  readonly date: PlainDate;
}

export interface DashboardWeek {
  /** "sample" data is synthetic and must be labelled as such wherever it is shown. */
  readonly source: 'live' | 'sample';
  readonly parentingTime: readonly ParentingTime[];
  readonly events: readonly FamilyEvent[];
  readonly pendingReviews: readonly PendingReview[];
  readonly recentMemories: readonly SharedMemory[];
}
