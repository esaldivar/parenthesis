import { LocalDateTime, PlainDate } from './model';

// Calendar arithmetic on plain dates ("YYYY-MM-DD") in the family's time zone. Dates are handled as UTC midnights
// internally so daylight-saving changes in the viewer's own zone can't shift a day.

const DAY_MS = 86_400_000;
export const LOCALE = 'en-US'; // Single place to localise later.

function toUtc(date: PlainDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): PlainDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: PlainDate, to: PlainDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** Weeks run Sunday to Saturday (product decision, docs/design/DASHBOARD.md). */
export function startOfWeek(date: PlainDate): PlainDate {
  const weekday = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -weekday);
}

export function weekDays(weekStart: PlainDate): PlainDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Today's date in the family's time zone (falls back to UTC for an unknown zone). */
export function todayIn(timeZone: string, now: Date): PlainDate {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

/** The current wall-clock time in the family's time zone, "YYYY-MM-DDTHH:mm" (UTC for an unknown zone). */
export function nowIn(timeZone: string, now: Date): LocalDateTime {
  const format = (zone: string) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
  };
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

/** The hour of day (0–23) in the family's time zone, for the greeting. */
export function hourIn(timeZone: string, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const utcFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' });

// ICU puts thin and narrow no-break spaces in ranges and times ("Oct 12 – 18", "3:00 PM"); plain spaces read and
// match predictably.
const plainSpaces = (text: string) => text.replace(/[\u2009\u202F]/g, ' ');

/** "Oct 12 – 18, 2026", "Sep 28 – Oct 4, 2026" or "Dec 28, 2026 – Jan 3, 2027". */
export function weekLabel(weekStart: PlainDate): string {
  return plainSpaces(
    utcFormat({ month: 'short', day: 'numeric', year: 'numeric' }).formatRange(toUtc(weekStart), toUtc(addDays(weekStart, 6))),
  );
}

/** "October 11 – 17, 2026" (the approved toolbar style). */
export function weekLabelLong(weekStart: PlainDate): string {
  return plainSpaces(
    utcFormat({ month: 'long', day: 'numeric', year: 'numeric' }).formatRange(toUtc(weekStart), toUtc(addDays(weekStart, 6))),
  );
}

/** "Oct 11" */
export const monthDay = (date: PlainDate) => utcFormat({ month: 'short', day: 'numeric' }).format(toUtc(date));

/** "8 AM" */
export function hourLabel(hour: number): string {
  return plainSpaces(utcFormat({ hour: 'numeric' }).format(new Date(Date.UTC(2000, 0, 1, hour))));
}

/** "Mon" */
export const weekdayShort = (date: PlainDate) => utcFormat({ weekday: 'short' }).format(toUtc(date));

/** "Oct 14, 2026" */
export const dateMedium = (date: PlainDate) =>
  utcFormat({ month: 'short', day: 'numeric', year: 'numeric' }).format(toUtc(date));

/** "Monday, October 12" */
export const dayLong = (date: PlainDate) => utcFormat({ weekday: 'long', month: 'long', day: 'numeric' }).format(toUtc(date));

/** "12" */
export const dayOfMonth = (date: PlainDate) => String(toUtc(date).getUTCDate());

/** "3:00 PM" from "HH:mm" */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return plainSpaces(utcFormat({ hour: 'numeric', minute: '2-digit' }).format(new Date(Date.UTC(2000, 0, 1, h, m))));
}

/** "Fri, Oct 16, 3:00 PM" from a local date-time. */
export function dateTimeLabel(value: LocalDateTime): string {
  const [date, time] = value.split('T');
  return `${utcFormat({ weekday: 'short', month: 'short', day: 'numeric' }).format(toUtc(date))}, ${timeLabel(time)}`;
}

export const datePart = (value: LocalDateTime): PlainDate => value.slice(0, 10);
