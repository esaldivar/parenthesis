import { CalendarCategory, CalendarEvent, CalendarWarning, Child, FamilyMember, Reminder, SharedTask } from '../../core/api/api';
import { CalendarPaletteKey, parentPalette } from './calendar-palette';
import { IconName } from '../../shared/icon/icon';
import { LocalDateTime, PlainDate } from '../dashboard/model';
import { addDays, daysBetween } from '../dashboard/week';
import { lastDate, toFamilyLocal } from './time';

/**
 * How an item reads on the calendar. Activities cover school, medical, dental, birthdays and the rest. Reminders
 * (#72) are shared notes for a day, not events: no location, approval or completion. Tasks (#73) are shared to-dos due
 * on a day.
 */
export type ItemKind = 'parenting' | 'family' | 'activity' | 'unavailable' | 'reminder' | 'task';

/**
 * Text first, never colour alone. `pending` waits for the other parent and is not on the schedule yet;
 * `change-pending` is confirmed, with a change or cancellation waiting for approval (it stays as it is until then);
 * `declined` was proposed and a parent declined it (#199): never on the schedule, shown until removed or past.
 */
export type ItemStatus = 'confirmed' | 'pending' | 'change-pending' | 'declined';

export interface Person {
  readonly id: string;
  readonly name: string;
}

/** One calendar event as the calendar shows it, in the family's time zone. Built from the API; never edited here. */
export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly kind: ItemKind;
  readonly palette?: CalendarPaletteKey;
  readonly category: CalendarCategory | 'Reminder' | 'Task';
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
  /** Reminders only: the reminder's id (`id` is per occurrence, so repeats stay distinct). */
  readonly reminderId?: string;
  /** Tasks only: the task's id, and whether it's done (said in words, never by colour alone). */
  readonly taskId?: string;
  readonly done?: boolean;
  /**
   * Unavailable time this parent chose to hide with the filters (#190): shown only as a subtle marker that opens its
   * details. Hiding never changes availability or conflict checks, which stay on the server.
   */
  readonly concealed?: boolean;
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

function statusOf(event: CalendarEvent): ItemStatus {
  switch (event.status) {
    case 'PendingApproval':
      return 'pending';
    case 'Rejected':
      return 'declined';
    default:
      return event.pendingChange !== 'None' ? 'change-pending' : 'confirmed';
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
    // Someone else's unavailable time is only ever "Unavailable" (the server already sends it that way).
    const hidden = kind === 'unavailable' && event.ownerMembershipId !== me;
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
      title: hidden ? 'Unavailable' : event.title,
      kind,
      palette: kind === 'parenting' ? parentPalette(event.caregiverMembershipId, members) : kind,
      category: event.category,
      categoryLabel: CATEGORY_LABELS[event.category],
      icon: ICONS[event.category],
      start,
      end,
      firstDate,
      lastDate: last,
      allDay: event.allDay,
      spansDays: event.allDay || last > firstDate,
      status: statusOf(event),
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
      location: hidden ? null : event.location,
      notes: hidden ? null : event.notes,
      warnings: event.warnings,
    } satisfies CalendarItem;
  });
}

/** A timed reminder is a moment; it takes one half-hour slot on the week grid. */
const REMINDER_SLOT_MINUTES = 30;

/** Builds the calendar's items from reminders (one per occurrence). A child who isn't active is left out. */
export function reminderItems(
  reminders: readonly Reminder[],
  members: readonly FamilyMember[],
  children: readonly Child[],
  timeZone: string,
): CalendarItem[] {
  const name = (membershipId: string) => members.find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT;
  const me = members.find((m) => m.isYou)?.membershipId;
  return reminders.map((reminder) => {
    const start = toFamilyLocal(reminder.startsAt, timeZone);
    const date = start.slice(0, 10);
    const end = reminder.allDay
      ? `${addDays(date, 1)}T00:00`
      : toFamilyLocal(new Date(Date.parse(reminder.startsAt) + REMINDER_SLOT_MINUTES * 60_000).toISOString(), timeZone);
    const child = children.find((c) => c.id === reminder.childId);
    return {
      id: `reminder:${reminder.id}:${reminder.startsAt}`,
      reminderId: reminder.id,
      title: reminder.title,
      kind: 'reminder',
      category: 'Reminder',
      categoryLabel: 'Reminder',
      icon: 'bell',
      start,
      end,
      firstDate: date,
      lastDate: date,
      allDay: reminder.allDay,
      spansDays: reminder.allDay,
      status: 'confirmed',
      pendingChange: 'None',
      beforeCoParentJoined: false,
      children: child ? [{ id: child.id, name: child.firstName }] : [],
      parents: [],
      ownerName: name(reminder.createdByMembershipId),
      isMine: reminder.createdByMembershipId === me,
      location: null,
      notes: reminder.details,
      warnings: [],
    } satisfies CalendarItem;
  });
}

/** Builds the calendar's items from tasks: each sits on its due date, all day. A child who isn't active is left out. */
export function taskItems(
  tasks: readonly SharedTask[],
  members: readonly FamilyMember[],
  children: readonly Child[],
): CalendarItem[] {
  const name = (membershipId: string) => members.find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT;
  const me = members.find((m) => m.isYou)?.membershipId;
  return tasks.map((task) => {
    const child = children.find((c) => c.id === task.childId);
    const done = task.completedAt !== null;
    return {
      id: `task:${task.id}`,
      taskId: task.id,
      done,
      title: task.title,
      kind: 'task',
      category: 'Task',
      categoryLabel: 'Task',
      icon: 'note',
      start: `${task.dueDate}T00:00`,
      end: `${addDays(task.dueDate, 1)}T00:00`,
      firstDate: task.dueDate,
      lastDate: task.dueDate,
      allDay: true,
      spansDays: true,
      status: 'confirmed',
      pendingChange: 'None',
      beforeCoParentJoined: false,
      children: child ? [{ id: child.id, name: child.firstName }] : [],
      parents: [],
      ownerName: name(task.createdByMembershipId),
      isMine: task.createdByMembershipId === me,
      location: null,
      notes: task.details,
      warnings: [],
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

/**
 * For unavailable time (#190): that parent's confirmed parenting time it overlaps, if any, so its details can offer a
 * swap. The Calendar page and the home page (#213) use the same rule.
 */
export function swapTargetFor(item: CalendarItem | null, items: readonly CalendarItem[]): CalendarItem | null {
  const owner = item?.kind === 'unavailable' ? item.parents[0]?.id : undefined;
  if (!item || !owner) {
    return null;
  }
  return (
    items.find(
      (i) =>
        i.category === 'ParentingTime' &&
        i.status === 'confirmed' &&
        i.parents[0]?.id === owner &&
        i.start < item.end &&
        item.start < i.end,
    ) ?? null
  );
}
