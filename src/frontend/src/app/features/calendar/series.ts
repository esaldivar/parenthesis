import { EventRepeat, SeriesFrequency, Weekday } from '../../core/api/api';
import { PlainDate } from '../dashboard/model';
import { addDays, dateMedium, monthDay } from '../dashboard/week';

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

/** The largest "every N" for each frequency, as on the server: a month of days, half a year of weeks, a year of months. */
export const MAX_INTERVAL: Record<SeriesFrequency, number> = { Daily: 99, Weekly: 99, Monthly: 99 };

/** How a series repeats: every `interval` days, weeks (on `days`) or months (#238). */
export interface RepeatRule {
  readonly frequency: SeriesFrequency;
  readonly interval: number;
  readonly days: readonly Weekday[];
}

const daysApart = (from: PlainDate, to: PlainDate) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
const monthsApart = (from: PlainDate, to: PlainDate) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** Whether a series starting on `first` happens on `date`, as the server decides it. */
function happensOn(rule: RepeatRule, first: PlainDate, date: PlainDate): boolean {
  const every = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'Daily':
      return daysApart(first, date) % every === 0;
    case 'Monthly':
      // The same day of the month; a month without it (the 31st in April) is skipped.
      return date.slice(8) === first.slice(8) && monthsApart(first, date) % every === 0;
    default:
      // Weeks are 7-day blocks from the first date, so every other Fri, Sat and Sun keeps each weekend together (#259).
      return rule.days.includes(weekdayOf(date)) && Math.floor(daysApart(first, date) / 7) % every === 0;
  }
}

/**
 * The dates of a series, as the server makes them: from the first date, until the end date or count, never past a
 * year (so a count that doesn't fit comes back short).
 */
export function seriesDates(first: PlainDate, rule: RepeatRule, until: PlainDate | null, count: number | null): PlainDate[] {
  const last = until && until < lastAllowed(first) ? until : lastAllowed(first);
  const limit = Math.min(count ?? MAX_DATES, MAX_DATES);
  const dates: PlainDate[] = [];
  for (let date = first; date <= last && dates.length < limit; date = addDays(date, 1)) {
    if (happensOn(rule, first, date)) {
      dates.push(date);
    }
  }
  return dates;
}

/** "1st", "2nd", "23rd", "31st". */
export function ordinal(day: number): string {
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${suffix}`;
}

/** "Wed and Fri", "Mon, Wed and Fri"; from the first date's weekday when given: "Fri, Sat and Sun" (#259). */
const dayList = (days: readonly Weekday[], first: PlainDate | null = null) => {
  const from = first ? utc(first).getUTCDay() : 0;
  const names = [...WEEKDAYS.slice(from), ...WEEKDAYS.slice(0, from)].filter((d) => days.includes(d.id)).map((d) => d.short);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
};

/**
 * How often, without the end: "Every day", "Every 3 days", "Every Wed and Fri", "Every 2 weeks on Tue",
 * "Every month on the 20th", "Every 2 months on the 20th". `first` gives a monthly repeat's day.
 */
export function everyText(rule: RepeatRule, first: PlainDate | null): string {
  const n = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'Daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'Monthly': {
      const on = first ? ` on the ${ordinal(Number(first.slice(8)))}` : '';
      return `${n === 1 ? 'Every month' : `Every ${n} months`}${on}`;
    }
    default:
      if (n === 1) {
        return rule.days.length === 7 ? 'Every day' : `Every ${dayList(rule.days, first)}`;
      }
      return `Every ${n} weeks on ${dayList(rule.days, first)}`;
  }
}

/**
 * The series' dates for its details (#239): "3 dates: Oct 28, Nov 4, Nov 11", "12 dates: Oct 28, Nov 4, Nov 11 and
 * 9 more". `firstDates` are the first dates' family-local days. Null when the server didn't say.
 */
export function datesText(count: number | undefined, firstDates: readonly PlainDate[]): string | null {
  if (!count || firstDates.length === 0) {
    return null;
  }
  const shown = firstDates.map(monthDay).join(', ');
  const more = count - firstDates.length;
  return `${count} ${count === 1 ? 'date' : 'dates'}: ${shown}${more > 0 ? ` and ${more} more` : ''}`;
}

/** "Every Wed and Fri until Nov 13, 2026", "Every 2 months on the 20th, 4 times". `first` is the series' first date. */
export function repeatText(repeat: EventRepeat, first: PlainDate | null = null): string {
  const every = everyText(repeat, first);
  if (repeat.count) {
    return `${every}, ${repeat.count} times`;
  }
  return repeat.until ? `${every} until ${dateMedium(repeat.until)}` : every;
}
