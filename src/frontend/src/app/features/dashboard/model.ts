// Shapes the dashboard needs. The live source fills them from the calendar, approvals, reminders and tasks APIs
// (#196); messages, memories and children's shares stay empty until those features exist. The development-only sample
// data fills everything.

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
  readonly palette?: import('../calendar/calendar-palette').CalendarPaletteKey;
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
  /** Optional descriptive title a parent gave it (e.g. "Dad's SeaWorld Adventure"); otherwise "Time with …". */
  readonly title?: string;
  /** The calendar event it comes from, so its details can open from the week (#213). Absent in sample data. */
  readonly eventId?: string;
}

/** Subcategories retain their icons; the owner-approved activity palette is shared (#255). */
export function eventPalette(category: EventCategory): import('../calendar/calendar-palette').CalendarPaletteKey {
  return category === 'family' || category === 'unavailable' ? category : 'activity';
}

/** Activity categories for icons (always alongside text). */
/**
 * `family`: an event both parents attend (e.g. a school play), with its own colour. `unavailable`: a parent's
 * blocked-out time. Both are mock styling for now (see the calendar key); the categories aren't in the API yet.
 */
export type EventCategory = 'school' | 'medical' | 'music' | 'sport' | 'art' | 'family' | 'unavailable' | 'other';

export interface FamilyEvent {
  /** The calendar event's id (live data); its details open from the week (#213). */
  readonly id: string;
  readonly title: string;
  readonly date: PlainDate;
  /** "HH:mm"; absent for all-day events. */
  readonly time?: string;
  /** Defaults to 60 minutes when unknown. */
  readonly durationMinutes?: number;
  /**
   * The last date it covers, when that's after `date` (a multi-day event). All-day and multi-day events sit in the
   * week's all-day row across their dates; single-day timed events sit in the hour grid (#208).
   */
  readonly endDate?: PlainDate;
  readonly category: EventCategory;
  /** Raw links retained even when a child is not in the active display roster. */
  readonly childIds?: readonly string[];
  readonly children: readonly ChildRef[];
  /** Parents attending, shown before the children (both parents for a family event). */
  readonly parents?: readonly Caregiver[];
  readonly status: ScheduleStatus;
}

export interface PendingReview {
  readonly id: string;
  readonly summary: string;
  readonly proposedBy: string;
}

/** Something a child chose to share with this parent from their own space. */
export interface KidShare {
  readonly id: string;
  readonly child: ChildRef;
  readonly kind: 'drawing' | 'photo';
  readonly sharedAt: string;
}

/** A message between the parents (messaging is parent-to-parent in the architecture). */
export interface RecentMessage {
  readonly id: string;
  readonly from: string;
  readonly preview: string;
  readonly sentAt: string;
}

export interface SharedMemory {
  readonly id: string;
  readonly title: string;
  readonly sharedBy: string;
  readonly date: PlainDate;
}

/** A shared reminder or task for Upcoming (#196). Tasks that are done aren't listed. */
export interface DashboardNote {
  readonly id: string;
  readonly kind: 'reminder' | 'task';
  readonly title: string;
  readonly date: PlainDate;
  /** "HH:mm" for a timed reminder; absent for all-day reminders and tasks (due that day). */
  readonly time?: string;
  readonly children: readonly ChildRef[];
}

export interface DashboardWeek {
  /** "sample" data is synthetic and must be labelled as such wherever it is shown. */
  readonly source: 'live' | 'sample';
  /** All active, authorized children, even those with no events this week. */
  readonly children: readonly ChildRef[];
  readonly parentingTime: readonly ParentingTime[];
  readonly events: readonly FamilyEvent[];
  readonly pendingReviews: readonly PendingReview[];
  readonly kidShares: readonly KidShare[];
  readonly recentMessages: readonly RecentMessage[];
  readonly recentMemories: readonly SharedMemory[];
  /** This week's reminders and tasks due, for Upcoming only (owner decision, October 22, 2026). */
  readonly notes?: readonly DashboardNote[];
}
