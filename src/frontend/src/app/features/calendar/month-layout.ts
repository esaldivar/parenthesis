import { PlainDate } from '../dashboard/model';
import { addDays, dayLong } from '../dashboard/week';
import { CalendarItem, byStart } from './calendar-items';
import { itemSummary, statusText } from './item-text';

/** Lanes of bars a week row shows; anything more is behind that day's "+N more" (#250). */
export const MONTH_LANES = 3;

/** One segment of an item in a week row: from its first to its last day in that week (#250). */
export interface MonthBar {
  readonly key: string;
  readonly item: CalendarItem;
  /** Grid columns, 1–8 (the end is exclusive). */
  readonly start: number;
  readonly end: number;
  /** 0 is the top lane. */
  readonly lane: number;
  /** It began in an earlier week, or goes on into a later one. */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
  /** What a screen reader hears: the item, and that this is part of a longer one. */
  readonly label: string;
  /** A short status in words for the bar: "Proposed", "Declined"…; null when confirmed. */
  readonly status: string | null;
}

/** A day whose items don't all fit: how many are hidden, and whether one is pending. */
export interface MonthMore {
  readonly date: PlainDate;
  readonly column: number;
  readonly count: number;
  readonly pending: number;
  readonly label: string;
}

/** Short status words for a bar, where space is tight. */
function barStatus(item: CalendarItem): string | null {
  if (item.kind === 'task') {
    return null;
  }
  switch (item.status) {
    case 'pending':
      return 'Proposed';
    case 'declined':
      return 'Declined';
    case 'change-pending':
      return statusText(item);
    default:
      return null;
  }
}

/**
 * Lays out one week row of Month view (#250): each item that touches the week is one bar across its own days in that
 * week, in the first lane free for all of them. Among items starting the same day, pending ones go first so a
 * proposal is the last thing hidden, then longer ones so they keep their lane. Items past the last lane are
 * counted on each day they cover, so nothing disappears silently.
 */
export function layOutWeek(
  days: readonly PlainDate[],
  items: readonly CalendarItem[],
): { bars: MonthBar[]; more: MonthMore[] } {
  const [first, last] = [days[0], days[days.length - 1]];
  const from = (i: CalendarItem) => (i.firstDate < first ? first : i.firstDate);
  const to = (i: CalendarItem) => (i.lastDate > last ? last : i.lastDate);
  const inWeek = items
    .filter((i) => i.firstDate <= last && i.lastDate >= first)
    .sort(
      (a, b) =>
        from(a).localeCompare(from(b)) ||
        Number(b.status === 'pending') - Number(a.status === 'pending') ||
        spanDays(from(b), to(b)) - spanDays(from(a), to(a)) ||
        byStart(a, b),
    );

  const taken: boolean[][] = [];
  const bars: MonthBar[] = [];
  const hidden = new Map<PlainDate, { count: number; pending: number }>();
  for (const item of inWeek) {
    const start = days.indexOf(from(item));
    const end = days.indexOf(to(item));
    let lane = 0;
    while (taken[lane]?.slice(start, end + 1).some(Boolean)) {
      lane++;
    }
    if (lane >= MONTH_LANES) {
      for (let d = start; d <= end; d++) {
        const counts = hidden.get(days[d]) ?? { count: 0, pending: 0 };
        hidden.set(days[d], { count: counts.count + 1, pending: counts.pending + (item.status === 'pending' ? 1 : 0) });
      }
      continue;
    }
    taken[lane] ??= [];
    for (let d = start; d <= end; d++) {
      taken[lane][d] = true;
    }
    const continuesBefore = item.firstDate < first;
    const continuesAfter = item.lastDate > last;
    const part = continuesBefore && continuesAfter ? ' Continues from last week and into next week.' : continuesBefore ? ' Continues from last week.' : continuesAfter ? ' Continues into next week.' : '';
    bars.push({
      key: `${item.id}:${first}`,
      item,
      start: start + 1,
      end: end + 2,
      lane,
      continuesBefore,
      continuesAfter,
      label: `${itemSummary(item)}${part}`,
      status: barStatus(item),
    });
  }

  const more = [...hidden.entries()].map(([date, { count, pending }]) => ({
    date,
    column: days.indexOf(date) + 1,
    count,
    pending,
    label: `${count} more on ${dayLong(date)}${pending ? `, ${pending} pending approval` : ''}. Open this week.`,
  }));
  return { bars, more };
}

const spanDays = (from: PlainDate, to: PlainDate) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The seven days of the week row that starts on `sunday`. */
export const weekOf = (sunday: PlainDate): PlainDate[] => Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
