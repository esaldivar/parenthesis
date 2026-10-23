import { DestroyRef } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { PlainDate } from '../dashboard/model';
import { addDays } from '../dashboard/week';
import { isPlainDate } from './plain-dates';

/**
 * Date rules for the calendar's forms (#232, owner decisions October 23, 2026). New dates are from today on in the
 * family's time zone (earlier times today are fine); an event already in the past keeps its own start when edited;
 * the end is never before the start; and moving the start past the end moves the end too, keeping the length.
 */

/** An event lasts up to 31 days (the server's limit). */
export const MAX_EVENT_DAYS = 31;

export const PAST_START = 'Choose a start date from today on.';
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

/**
 * The days the range calendar offers. While the end is being chosen (a start but no end yet), only days up to the
 * longest an event can last stay open; days before the start stay open too, as choosing one starts the range again.
 */
export function rangeFilter(
  today: PlainDate,
  own: readonly PlainDate[],
  start: PlainDate | null,
  end: PlainDate | null,
  maxDays: number,
): (day: PlainDate | null) => boolean {
  const choosingEnd = isPlainDate(start) && !end;
  return (day) =>
    choosable(day, today, own) &&
    !(choosingEnd && day! > start! && daysBetween(start!, day!) > maxDays);
}

/** The end after the start moves: it moves with it, keeping the length, when it would otherwise be before the start. */
export function endAfterMove(
  oldStart: PlainDate,
  oldEnd: PlainDate,
  newStart: PlainDate,
): PlainDate {
  if (
    !isPlainDate(oldStart) ||
    !isPlainDate(oldEnd) ||
    !isPlainDate(newStart) ||
    newStart <= oldEnd
  ) {
    return oldEnd;
  }
  return addDays(newStart, Math.max(0, daysBetween(oldStart, oldEnd)));
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/**
 * The end time after the start time moves on a one-day event: when it would be at or before the new start, it moves
 * with it, keeping the length (into the next day if needed).
 */
export function endTimeAfterMove(
  date: PlainDate,
  oldStartTime: string,
  oldEndTime: string,
  newStartTime: string,
): { endDate: PlainDate; endTime: string } | null {
  if (
    !/^\d{2}:\d{2}$/.test(oldStartTime) ||
    !/^\d{2}:\d{2}$/.test(oldEndTime) ||
    !/^\d{2}:\d{2}$/.test(newStartTime)
  ) {
    return null;
  }
  if (minutes(oldEndTime) > minutes(newStartTime)) {
    return null;
  }
  const length = Math.max(30, minutes(oldEndTime) - minutes(oldStartTime));
  const end = minutes(newStartTime) + length;
  return { endDate: end >= 24 * 60 ? addDays(date, 1) : date, endTime: clock(end) };
}

/** The parts of an event form these rules look at. */
export interface RangeValue {
  readonly allDay: boolean;
  readonly startDate: PlainDate | null;
  readonly startTime: string;
  readonly endDate: PlainDate | null;
  readonly endTime: string;
}

/** The longest an event can be, in calendar days from its first to its last date. */
export const maxDaysFor = (allDay: boolean) => (allDay ? MAX_EVENT_DAYS - 1 : MAX_EVENT_DAYS);

/**
 * What's wrong with an event's dates, by the API's field names: `startsAt` (unreadable, or before today) and `endsAt`
 * (missing, unreadable, or not after the start). `own` are the event's current dates, which an edit may keep.
 */
export function rangeProblems(
  v: RangeValue,
  today: PlainDate,
  own: readonly PlainDate[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const typed = (value: PlainDate | null) => !!value && !isPlainDate(value);
  if (typed(v.startDate) || typed(v.endDate)) {
    errors['startsAt'] = UNREADABLE_DATE;
    return errors;
  }
  if (!v.startDate || !v.endDate) {
    errors['endsAt'] = 'Choose when it starts and ends.';
    return errors;
  }
  if (v.startDate < today && !own.includes(v.startDate)) {
    errors['startsAt'] = PAST_START;
    return errors;
  }
  const start = v.allDay ? v.startDate : `${v.startDate}T${v.startTime}`;
  const end = v.allDay ? v.endDate : `${v.endDate}T${v.endTime}`;
  if (v.allDay ? end < start : end <= start) {
    errors['endsAt'] = 'Choose an end that’s after the start.';
  }
  return errors;
}

/** Any event form with these four fields (Add, Edit, Request Swap). */
interface RangeForm {
  readonly controls: { readonly endDate: FormControl<string> };
  readonly valueChanges: Observable<unknown>;
  getRawValue(): { startDate: string; startTime: string; endDate: string; endTime: string };
  patchValue(value: { endDate?: string; endTime?: string }): void;
}

/**
 * Keeps an event form's range in order as the parent edits it (owner decision, October 23, 2026): moving the start
 * date past the end moves the end date with it, and moving a one-day event's start time to or past its end moves the
 * end time with it, each keeping the length. The range is never left invalid.
 */
export function keepRangeInOrder(form: RangeForm, destroyRef: DestroyRef): void {
  let last = form.getRawValue();
  let adjusting = false;
  const subscription = form.valueChanges.subscribe(() => {
    if (adjusting) {
      return;
    }
    const v = form.getRawValue();
    adjusting = true;
    try {
      // Only when the parent moved the start alone: a form filled in all at once is left as it is.
      const endUntouched = v.endDate === last.endDate && v.endTime === last.endTime;
      if (
        endUntouched &&
        v.startDate !== last.startDate &&
        last.startDate &&
        last.endDate &&
        v.endDate
      ) {
        const end = endAfterMove(last.startDate, last.endDate, v.startDate);
        if (end !== v.endDate) {
          form.controls.endDate.setValue(end);
        }
      } else if (
        endUntouched &&
        v.startTime !== last.startTime &&
        v.startDate &&
        v.startDate === v.endDate
      ) {
        const moved = endTimeAfterMove(v.startDate, last.startTime, last.endTime, v.startTime);
        if (moved) {
          form.patchValue(moved);
        }
      }
    } finally {
      adjusting = false;
    }
    last = form.getRawValue();
  });
  destroyRef.onDestroy(() => subscription.unsubscribe());
}
