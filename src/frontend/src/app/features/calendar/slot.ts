import { signal } from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { dayLong, timeLabel } from '../dashboard/week';

/**
 * Adding from a tap on a calendar (#212). A timed day column gives the date and the half-hour under the pointer; the
 * all-day row, Month and the day lists give the date only. Times are wall-clock times in the family's time zone, as
 * the Add page reads them, so daylight-saving changes don't shift them. Nothing is saved until the parent sends it.
 */
export interface AddAt {
  readonly date: PlainDate;
  /** "HH:mm", the start of the half-hour tapped. */
  readonly time?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The half-hour at height `y` of a day column that runs from `startHour` to `endHour`. */
export function slotAt(y: number, height: number, startHour: number, endHour: number): string {
  const slots = Math.max(1, (endHour - startHour) * 2);
  const index = Math.min(slots - 1, Math.max(0, Math.floor((y / height) * slots)));
  const minutes = startHour * 60 + index * 30;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * A click on a day column's background: the half-hour under the pointer. From the keyboard (no pointer position) it's
 * the date only, and the parent picks the time on the Add page.
 *
 * Month days, the all-day row and the day lists have a pointer-only layer behind their items instead (`tabindex="-1"`,
 * hidden from screen readers): keyboard users add from the labelled day-column buttons, or the page's Add button.
 */
export function addFromColumn(
  event: MouseEvent,
  date: PlainDate,
  startHour: number,
  endHour: number,
): AddAt {
  const column = event.currentTarget as HTMLElement | null;
  const rect = column?.getBoundingClientRect();
  if (event.detail === 0 || !rect || rect.height <= 0) {
    return { date };
  }
  return { date, time: slotAt(event.clientY - rect.top, rect.height, startHour, endHour) };
}

/** A tap on a row that spans the week's days side by side (the all-day row): the day under the pointer. */
export function dayInRow(event: MouseEvent, days: readonly PlainDate[]): PlainDate | null {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || days.length === 0) {
    return null;
  }
  const index = Math.min(
    days.length - 1,
    Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * days.length)),
  );
  return days[index];
}

/** The Add page's address for it. */
export const addQuery = (at: AddAt): Record<string, string> =>
  at.time ? { date: at.date, time: at.time } : { date: at.date };

/** The same place: the same day, and the same half-hour when there is one. */
export const samePlace = (a: AddAt | null, b: AddAt | null): boolean => !!a && !!b && a.date === b.date && a.time === b.time;

/** The highlighted hour's grid rows (30-minute rows from midnight, 1-based): an hour from the half-hour tapped. */
export function pickRows(time: string): string {
  const row = Math.floor((Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) / 30) + 1;
  return `${Math.min(row, 47)} / span 2`;
}

/**
 * Highlight, then add (#237, owner decision October 23, 2026), as Google Calendar does: a tap on empty space highlights
 * that hour (or day), and a tap on the highlight adds there. Tapping elsewhere moves it; Escape, a tap outside the
 * calendar or another week clears it. From the keyboard (no pointer) it adds at once, as before, since keyboard users
 * reach it through the labelled "Add on …" buttons.
 */
export class SlotPick {
  readonly at = signal<AddAt | null>(null);

  constructor(private readonly add: (at: AddAt) => void) {}

  /** A tap on empty space. `pointer` is false for a keyboard press. */
  tap(at: AddAt, pointer: boolean): void {
    if (!pointer || samePlace(this.at(), at)) {
      this.confirm(at);
    } else {
      this.at.set(at);
    }
  }

  /** Adds at the highlight (or `at`), and clears it. */
  confirm(at: AddAt | null = this.at()): void {
    this.at.set(null);
    if (at) {
      this.add(at);
    }
  }

  clear(): void {
    this.at.set(null);
  }

  /** Whether the highlight is on this day (any time). */
  onDay(date: PlainDate): boolean {
    return this.at()?.date === date;
  }
}

/** The highlight's button name: "Add on Tuesday, October 20 at 6:00 PM". */
export const pickLabel = (at: AddAt): string => `Add on ${dayLong(at.date)}${at.time ? ` at ${timeLabel(at.time)}` : ''}`;

/** The highlight's text: "6:00 PM", or "Add" for a whole day. */
export const pickText = (at: AddAt): string => (at.time ? timeLabel(at.time) : 'Add');

/**
 * Clears a highlight on a click anywhere but empty space or the highlight itself (an item, the toolbar, outside the
 * calendar). The calendars call it from a document listener, which runs after the tap that set the highlight.
 */
export function clearsPick(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest('.slot-add__button, .tap-add__button, .day__add, .slot-pick'));
}
