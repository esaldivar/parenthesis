import { EventRepeat, Weekday } from '../../core/api/api';
import { PlainDate } from '../dashboard/model';
import { addDays, dateMedium } from '../dashboard/week';

export const WEEKDAYS: readonly { id: Weekday; short: string }[] = [
  { id: 'Sunday', short: 'Sun' },
  { id: 'Monday', short: 'Mon' },
  { id: 'Tuesday', short: 'Tue' },
  { id: 'Wednesday', short: 'Wed' },
  { id: 'Thursday', short: 'Thu' },
  { id: 'Friday', short: 'Fri' },
  { id: 'Saturday', short: 'Sat' },
];

/** The most dates one series may have (every day for a year), as on the server. */
export const MAX_DATES = 366;

const utc = (date: PlainDate) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const weekdayOf = (date: PlainDate): Weekday => WEEKDAYS[utc(date).getUTCDay()].id;

/** The last date a series starting on `first` may reach: the same date a year later. */
export function lastAllowed(first: PlainDate): PlainDate {
  const date = utc(first);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The dates of a weekly series, as the server makes them: each chosen weekday from the first date, until the end date
 * or count, never past a year (so a count that doesn't fit comes back short).
 */
export function seriesDates(first: PlainDate, days: readonly Weekday[], until: PlainDate | null, count: number | null): PlainDate[] {
  const last = until && until < lastAllowed(first) ? until : lastAllowed(first);
  const limit = Math.min(count ?? MAX_DATES, MAX_DATES);
  const dates: PlainDate[] = [];
  for (let date = first; date <= last && dates.length < limit; date = addDays(date, 1)) {
    if (days.includes(weekdayOf(date))) {
      dates.push(date);
    }
  }
  return dates;
}

/** "Every Wed and Fri until Nov 13, 2026", or "Every Mon, 4 times". */
export function repeatText(repeat: EventRepeat): string {
  const names = WEEKDAYS.filter((d) => repeat.days.includes(d.id)).map((d) => d.short);
  const days = names.length === 7 ? 'day' : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const every = `Every ${days}`;
  if (repeat.count) {
    return `${every}, ${repeat.count} times`;
  }
  return repeat.until ? `${every} until ${dateMedium(repeat.until)}` : every;
}
