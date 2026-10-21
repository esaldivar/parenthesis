import { CalendarCategory, CalendarEvent, CalendarWarning, Child, FamilyMember } from '../../core/api/api';
import { IconName } from '../../shared/icon/icon';
import { LocalDateTime, PlainDate } from '../dashboard/model';
import { daysBetween } from '../dashboard/week';
import { lastDate, toFamilyLocal } from './time';

/** How an item reads on the calendar. Activities cover school, medical, dental, birthdays and the rest. */
export type ItemKind = 'parenting' | 'family' | 'activity' | 'unavailable';

/**
 * Text first, never colour alone. `pending` waits for the other parent and is not on the schedule yet;
 * `change-pending` is confirmed, with a change or cancellation waiting for approval (it stays as it is until then).
 */
export type ItemStatus = 'confirmed' | 'pending' | 'change-pending';

export interface Person {
  readonly id: string;
  readonly name: string;
}

/** One calendar event as the calendar shows it, in the family's time zone. Built from the API; never edited here. */
export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly kind: ItemKind;
  readonly category: CalendarCategory;
  readonly categoryLabel: string;
  readonly icon: IconName;
  readonly start: LocalDateTime;
  /** Exclusive. */
  readonly end: LocalDateTime;
  readonly firstDate: PlainDate;
  readonly lastDate: PlainDate;
  readonly allDay: boolean;
  /** All-day or spanning several dates: shown in the all-day row, across its dates only. */
  readonly spansDays: boolean;
  readonly status: ItemStatus;
  readonly pendingChange: 'None' | 'Modify' | 'Cancel';
  /** Auto-confirmed while the family had one parent; shown so the co-parent can review it (decision 7). */
  readonly beforeCoParentJoined: boolean;
  readonly children: readonly Person[];
  /** The parents shown on it: the caregiver for parenting time, both parents for a family event, the owner otherwise. */
  readonly parents: readonly Person[];
  readonly ownerName: string;
  readonly isMine: boolean;
  readonly location: string | null;
  /** Unavailable notes are only ever sent to their owner. */
  readonly notes: string | null;
  readonly warnings: readonly CalendarWarning[];
}

const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  ParentingTime: 'Parenting time',
  Joint: 'Family event',
  School: 'School',
  Medical: 'Medical',
  Dental: 'Dental',
  Activity: 'Activity',
  Birthday: 'Birthday',
  Holiday: 'Holiday',
  Unavailable: 'Unavailable',
  Other: 'Other',
};

const ICONS: Record<CalendarCategory, IconName> = {
  ParentingTime: 'calendar',
  Joint: 'children',
  School: 'book',
  Medical: 'tooth',
  Dental: 'tooth',
  Activity: 'soccer',
  Birthday: 'star',
  Holiday: 'leaf',
  Unavailable: 'block',
  Other: 'calendar',
};

export const FORMER_PARENT = 'Former parent';

function kindOf(category: CalendarCategory): ItemKind {
  switch (category) {
    case 'ParentingTime':
    case 'Holiday':
      return 'parenting';
    case 'Joint':
      return 'family';
    case 'Unavailable':
      return 'unavailable';
    default:
      return 'activity';
  }
}

/** Builds the calendar's items from API events. Children who aren't active (or were removed) are left out. */
export function toItems(
  events: readonly CalendarEvent[],
  members: readonly FamilyMember[],
  children: readonly Child[],
  timeZone: string,
): CalendarItem[] {
  const name = (membershipId: string | null) =>
    members.find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT;
  const parents = members.filter((m) => m.role === 'Parent');
  const me = members.find((m) => m.isYou)?.membershipId;

  return events.map((event) => {
    const kind = kindOf(event.category);
    const start = toFamilyLocal(event.startsAt, timeZone);
    const end = toFamilyLocal(event.endsAt, timeZone);
    const firstDate = start.slice(0, 10);
    const last = lastDate(start, end);
    const shownParents: Person[] =
      kind === 'family'
        ? parents.map((p) => ({ id: p.membershipId, name: p.displayName }))
        : kind === 'parenting'
          ? [{ id: event.caregiverMembershipId ?? '', name: name(event.caregiverMembershipId) }]
          : kind === 'unavailable'
            ? [{ id: event.ownerMembershipId, name: name(event.ownerMembershipId) }]
            : [];
    return {
      id: event.id,
      title: event.title,
      kind,
      category: event.category,
      categoryLabel: CATEGORY_LABELS[event.category],
      icon: ICONS[event.category],
      start,
      end,
      firstDate,
      lastDate: last,
      allDay: event.allDay,
      spansDays: event.allDay || last > firstDate,
      status: event.status === 'PendingApproval' ? 'pending' : event.pendingChange !== 'None' ? 'change-pending' : 'confirmed',
      pendingChange: event.pendingChange,
      beforeCoParentJoined: event.confirmedBeforeCoParentJoined,
      children: event.childIds
        .map((id) => children.find((c) => c.id === id))
        .filter((c): c is Child => !!c)
        .map((c) => ({ id: c.id, name: c.firstName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      parents: shownParents,
      ownerName: name(event.ownerMembershipId),
      isMine: event.ownerMembershipId === me,
      location: event.location,
      notes: event.notes,
      warnings: event.warnings,
    } satisfies CalendarItem;
  });
}

/** Items on a date: those that cover it. */
export const onDate = (items: readonly CalendarItem[], date: PlainDate) =>
  items.filter((i) => i.firstDate <= date && i.lastDate >= date);

/** Child filter: "all", or one child's id. An item with no children (unavailable time, a parents-only event) always shows. */
export function forChild(items: readonly CalendarItem[], childId: string | null): CalendarItem[] {
  return childId ? items.filter((i) => i.children.length === 0 || i.children.some((c) => c.id === childId)) : [...items];
}

/** How many dates an item covers (at least 1). */
export const dateSpan = (item: CalendarItem) => daysBetween(item.firstDate, item.lastDate) + 1;

/** Sort: by start, then all-day first, then title. */
export function byStart(a: CalendarItem, b: CalendarItem): number {
  return a.start.localeCompare(b.start) || Number(b.spansDays) - Number(a.spansDays) || a.title.localeCompare(b.title);
}
