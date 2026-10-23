import { PlainDate } from '../dashboard/model';
import { addDays } from '../dashboard/week';
import { isPlainDate } from './plain-dates';

/**
 * Date rules for the calendar's forms (#232, #248; owner decisions October 23, 2026). New dates are from today on in
 * the family's time zone (earlier times today are fine), and an event already in the past keeps its own days when
 * edited: those are the only days a calendar disables. Whether the end comes after the start, and the 31-day limit,
 * are checked rather than enforced by disabled days: either date can always be picked or corrected, an invalid one
 * shows red and the form can't be sent, and nothing moves the other date for the parent (#248).
 */

/** An event lasts up to 31 days (the server's limit). */
export const MAX_EVENT_DAYS = 31;

export const PAST_START = 'Choose a start date from today on.';
export const PAST_END = 'Choose an end date from today on.';
export const PAST_DATE = 'Choose a date from today on.';
export const UNREADABLE_DATE = 'Enter a date like 10/27/2026.';

/** Whole days from one date to another. */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A day that can be chosen: from today on, or the item's own date when it's already past (so editing keeps it). */
export function choosable(
  day: PlainDate | null,
  today: PlainDate,
  own: readonly PlainDate[] = [],
): boolean {
  return !!day && (day >= today || own.includes(day));
}

/** The days a date calendar offers: from today on, and the item's own days when editing (#248). */
export function dayFilter(today: PlainDate, own: readonly PlainDate[] = []): (day: PlainDate | null) => boolean {
  return (day) => choosable(day, today, own);
}

/** The parts of an event form these rules look at. */
export interface RangeValue {
  readonly allDay: boolean;
  readonly startDate: PlainDate | null;
  readonly startTime: string;
  readonly endDate: PlainDate | null;
  readonly endTime: string;
}

export const MISSING_START = 'Choose a start date.';
export const MISSING_END = 'Choose an end date.';
export const END_BEFORE_START = 'Choose an end that’s after the start.';
export const TOO_LONG = `Choose an end within ${MAX_EVENT_DAYS} days of the start.`;

/** Minutes from the start of the first day, for a local date and optional time ("HH:mm"). */
const localMinutes = (date: PlainDate, time = '00:00') => Date.parse(`${date}T${time}:00Z`) / 60_000;

/**
 * What's wrong with an event's dates, by the API's field names: `startsAt` (missing, unreadable, or before today) and
 * `endsAt` (missing, unreadable, before today, not after the start, or more than 31 days on). `own` are the event's
 * current days, which an edit may keep. The messages are for screen readers: on screen an invalid date is only red
 * (#248).
 */
export function rangeProblems(
  v: RangeValue,
  today: PlainDate,
  own: readonly PlainDate[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const startOk = isPlainDate(v.startDate);
  const endOk = isPlainDate(v.endDate);
  if (!v.startDate) {
    errors['startsAt'] = MISSING_START;
  } else if (!startOk) {
    errors['startsAt'] = UNREADABLE_DATE;
  } else if (v.startDate < today && !own.includes(v.startDate)) {
    errors['startsAt'] = PAST_START;
  }
  if (!v.endDate) {
    errors['endsAt'] = MISSING_END;
  } else if (!endOk) {
    errors['endsAt'] = UNREADABLE_DATE;
  } else if (v.endDate < today && !own.includes(v.endDate)) {
    errors['endsAt'] = PAST_END;
  }
  if (startOk && endOk && !errors['endsAt']) {
    // An all-day event's end is the midnight after its last day.
    const start = localMinutes(v.startDate!, v.allDay ? undefined : v.startTime);
    const end = v.allDay ? localMinutes(addDays(v.endDate!, 1)) : localMinutes(v.endDate!, v.endTime);
    if (end <= start) {
      errors['endsAt'] = END_BEFORE_START;
    } else if (end - start > MAX_EVENT_DAYS * 24 * 60) {
      errors['endsAt'] = TOO_LONG;
    }
  }
  return errors;
}

/**
 * Which date fields show red, and why (for screen readers): the live problems with the dates as they are, plus
 * the server's answer to the last send until the dates change. A missing date only shows after a send was tried,
 * so a range being picked isn't marked while it's half done.
 */
export function dateIssues(
  live: Record<string, string>,
  server: Record<string, string>,
  attempted: boolean,
): { start: string | null; end: string | null } {
  const shown = (key: string, missing: string) => {
    const problem = live[key] ?? server[key] ?? null;
    return problem === missing && !attempted ? null : problem;
  };
  return { start: shown('startsAt', MISSING_START), end: shown('endsAt', MISSING_END) };
}
