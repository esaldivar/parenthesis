import { AppLocale } from '../../core/i18n/locale.service';
import { translate } from '../../core/i18n/translations';
import { PlainDate } from '../../core/dates/plain-date';
import { addDays, dayLong } from '../../core/dates/dates';
import { CalendarItem, byStart } from './calendar-items';
import { itemSummary, statusWord } from './components/item-text/item-text.component';

/**
 * Lanes of item bars a week row shows under its parenting-time row; anything more is behind that day's "+N more"
 * (#250; two lanes in the Quiet Planner, #729).
 */
export const MONTH_LANES = 2;
/** Parenting time has its own row in every week (#729): one lane, continuous across the days it covers. */
export const PARENTING_LANES = 1;

/** One segment of an item in a week row: from its first to its last day in that week (#250). */
export interface MonthBar {
  readonly key: string;
  readonly item: CalendarItem;
  /** Grid columns, 1–8 (the end is exclusive). */
  readonly start: number;
  readonly end: number;
  /** `parenting`: the week's dedicated parenting-time row; `items`: the lanes under it (#729). */
  readonly row: 'parenting' | 'items';
  /** 0 is the top lane of its row. */
  readonly lane: number;
  /** It began in an earlier week, or goes on into a later one. */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
  /** What a screen reader hears: the item, and that this is part of a longer one. */
  readonly label: string;
  /** A short status in words for the bar: "Proposed", "Declined"…; null when confirmed. */
  readonly status: string | null;
}

/** Hidden unavailable time on one day (#190): a marker by the date that opens its details, never its notes. */
export interface MonthConcealed {
  readonly date: PlainDate;
  readonly column: number;
  readonly items: readonly CalendarItem[];
}

/** A day whose items don't all fit: how many are hidden, and whether one is pending. */
export interface MonthMore {
  readonly date: PlainDate;
  readonly column: number;
  readonly count: number;
  readonly pending: number;
  readonly label: string;
}

/**
 * Lays out one week row of Month view (#250): each item that touches the week is one bar across its own days in that
 * week, in the first lane free for all of them. Parenting time has its own row (#729); everything else shares the
 * lanes under it. Among items starting the same day, pending ones go first so a proposal is the last thing hidden,
 * then longer ones so they keep their lane. Items past the last lane are counted on each day they cover, so nothing
 * disappears silently. Hidden unavailable time (#190) is returned per day for its marker, outside the lanes.
 */
export function layOutWeek(
  days: readonly PlainDate[],
  items: readonly CalendarItem[],
  locale: AppLocale = 'en',
): { bars: MonthBar[]; more: MonthMore[]; concealed: MonthConcealed[] } {
  const intl = locale === 'en' ? 'en-US' : locale;
  const [first, last] = [days[0], days[days.length - 1]];
  const from = (i: CalendarItem) => (i.firstDate < first ? first : i.firstDate);
  const to = (i: CalendarItem) => (i.lastDate > last ? last : i.lastDate);
  const touching = items.filter((i) => i.firstDate <= last && i.lastDate >= first);
  const concealed = days
    .map((date, d) => ({ date, column: d + 1, items: touching.filter((i) => i.concealed && i.firstDate <= date && i.lastDate >= date) }))
    .filter((c) => c.items.length > 0);
  const inWeek = touching
    .filter((i) => !i.concealed)
    .sort(
      (a, b) =>
        from(a).localeCompare(from(b)) ||
        Number(b.status === 'pending') - Number(a.status === 'pending') ||
        spanDays(from(b), to(b)) - spanDays(from(a), to(a)) ||
        byStart(a, b),
    );

  const taken = { parenting: [] as boolean[][], items: [] as boolean[][] };
  const bars: MonthBar[] = [];
  const hidden = { parenting: new Map<PlainDate, { count: number; pending: number }>(), items: new Map<PlainDate, { count: number; pending: number }>() };
  for (const item of inWeek) {
    const row = item.kind === 'parenting' ? 'parenting' : 'items';
    const start = days.indexOf(from(item));
    const end = days.indexOf(to(item));
    let lane = 0;
    while (taken[row][lane]?.slice(start, end + 1).some(Boolean)) {
      lane++;
    }
    if (lane >= (row === 'parenting' ? PARENTING_LANES : MONTH_LANES)) {
      for (let d = start; d <= end; d++) {
        const counts = hidden[row].get(days[d]) ?? { count: 0, pending: 0 };
        hidden[row].set(days[d], { count: counts.count + 1, pending: counts.pending + (item.status === 'pending' ? 1 : 0) });
      }
      continue;
    }
    taken[row][lane] ??= [];
    for (let d = start; d <= end; d++) {
      taken[row][lane][d] = true;
    }
    const continuesBefore = item.firstDate < first;
    const continuesAfter = item.lastDate > last;
    const part = continuesBefore && continuesAfter
      ? ' ' + translate('calendar.month.continuesBoth', locale)
      : continuesBefore
        ? ' ' + translate('calendar.month.continuesFrom', locale)
        : continuesAfter
          ? ' ' + translate('calendar.month.continuesInto', locale)
          : '';
    // Month bars sit in week rows, without a labelled day ancestor. Every occurrence needs its own full date (#250).
    const firstDate = `${dayLong(item.firstDate, intl)}, ${item.firstDate.slice(0, 4)}`;
    const lastDate = `${dayLong(item.lastDate, intl)}, ${item.lastDate.slice(0, 4)}`;
    const dates = item.firstDate === item.lastDate
      ? firstDate
      : translate('calendar.month.through', locale, { from: firstDate, to: lastDate });
    const status = statusWord(item, locale);
    bars.push({
      key: `${item.id}:${first}`,
      item,
      start: start + 1,
      end: end + 2,
      row,
      lane,
      continuesBefore,
      continuesAfter,
      label: `${status ? `${status}: ` : ''}${itemSummary(item, locale)}, ${dates}${part}`,
      status,
    });
  }

  const toMore = (counts: Map<PlainDate, { count: number; pending: number }>): MonthMore[] =>
    [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, pending }]) => ({
        date,
        column: days.indexOf(date) + 1,
        count,
        pending,
        label: translate(pending ? 'calendar.month.morePending' : 'calendar.month.more', locale, {
          count,
          date: dayLong(date, intl),
          pending,
        }),
      }));
  // A day's count covers everything hidden there, parenting time included.
  const merged = new Map(hidden.items);
  for (const [date, counts] of hidden.parenting) {
    const was = merged.get(date) ?? { count: 0, pending: 0 };
    merged.set(date, { count: was.count + counts.count, pending: was.pending + counts.pending });
  }
  return { bars, more: toMore(merged), concealed };
}

const spanDays = (from: PlainDate, to: PlainDate) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The seven days of the week row that starts on `sunday`. */
export const weekOf = (sunday: PlainDate): PlainDate[] => Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
