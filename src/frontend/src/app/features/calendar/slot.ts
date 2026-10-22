import { PlainDate } from '../dashboard/model';

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
