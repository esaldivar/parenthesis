import { inject } from '@angular/core';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { CalendarPalette } from '../../calendar-palette';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  afterRenderEffect,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PlainDate } from '../../../../core/dates/plain-date';
import { dayLong, dayOfMonth, hourLabel, monthDay, timeLabel, weekDays, weekdayShort } from '../../../../core/dates/dates';
import { AddAt, SlotPick, addFromColumn, clearsPick, dayInRow, pickLabel, pickRows, pickText } from '../../slot';
import { CalendarItem, byStart, onDate } from '../../calendar-items';
import { itemSummary } from '../item-text/item-text.component';
import { ItemCard, cardTint } from '../item-card/item-card.component';
import { NarrowHost } from '../../narrow';
import { minutesOfDay } from '../../time';

const SLOT = 30;
const MIN_SLOTS = 2;
/** The desktop grid's half-hour height in pixels: one full hour row is 44px (#729). */
const HALF_HOUR_PX = 22;
/** A group of events at the same time: its heading, then each event on its own readable row (#729). */
const GROUP_HEAD_PX = 16;
const GROUP_ROW_PX = 24;
/** The grid opens on a complete hour row: 8 AM, or the week's earliest event if sooner. */
const OPENING_HOUR = 8;

interface Span {
  readonly item: CalendarItem;
  readonly start: number;
  readonly end: number;
  readonly lane: number;
}

/** Greedy lanes: each item takes the first lane that's free from `start`. */
function lanes<T extends { start: number; end: number }>(entries: readonly T[]): (T & { lane: number })[] {
  const laneEnds: number[] = [];
  return entries.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.start);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = entry.end;
    return { ...entry, lane: lane + 1 };
  });
}

/**
 * The Week view (the default; Quiet Planner #729). Desktop: all-day and multi-day items, parenting time among them,
 * sit in the all-day row across their own dates only; timed items sit in their slots, side by side when they overlap,
 * and events starting at the same time are stacked under that time so every title stays readable.
 *
 * Phones: the seven days stay fixed in a strip and the chosen day's agenda slides in under it (later days from the
 * right, earlier ones from the left; no movement with reduced motion). Every item is a button that opens its details.
 */
@Component({
  selector: 'app-calendar-week',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, ItemCard],
  templateUrl: './calendar-week.component.html',
  styleUrl: './calendar-week.component.scss',
})
export class CalendarWeek extends NarrowHost {
  private readonly locale = inject(LocaleService);
  readonly weekStart = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  /** The date the page is showing: a phone opens its agenda there when it's in this week (#729). */
  readonly anchor = input<PlainDate | null>(null);
  readonly selected = output<CalendarItem>();
  /** A tap on empty space (#212): add on that day, at the half-hour tapped in the time grid. */
  readonly add = output<AddAt>();

  /** The highlighted time or day (#237): a first tap highlights it, a tap on the highlight adds there. */
  protected readonly pick = new SlotPick((at) => this.add.emit(at));
  protected readonly pickLabel = (at: AddAt) => pickLabel(at, this.locale.locale());
  protected readonly pickRows = pickRows;
  protected readonly pickText = (at: AddAt) => pickText(at, this.locale.locale());
  /** The highlighted day's column in the all-day row (1–7), for a whole-day highlight. */
  protected readonly pickColumn = computed(() => {
    const at = this.pick.at();
    const index = at && !at.time ? weekDays(this.weekStart()).indexOf(at.date) : -1;
    return index === -1 ? null : index + 1;
  });

  protected addInColumn(event: MouseEvent, date: PlainDate): void {
    this.pick.tap(addFromColumn(event, date, 0, 24), event.detail !== 0);
  }

  protected addInAllDayRow(event: MouseEvent): void {
    const date = dayInRow(event, this.days().map((d) => d.date));
    if (date) {
      this.pick.tap({ date }, true);
    }
  }

  @HostListener('document:click', ['$event.target'])
  protected clickAnywhere(target: EventTarget | null): void {
    if (clearsPick(target)) {
      this.pick.clear();
    }
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.pick.clear();
  }

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly days = computed(() =>
    weekDays(this.weekStart()).map((date) => ({
      date,
      weekday: weekdayShort(date, this.locale.locale()),
      monthDay: monthDay(date, this.locale.locale()),
      dayOfMonth: dayOfMonth(date),
      longLabel: dayLong(date, this.locale.locale()),
      isToday: date === this.today(),
      items: onDate(this.items(), date).sort(byStart),
    })).map((day) => {
      const count = day.items.filter((i) => !i.concealed).length;
      const key = count === 0 ? 'calendar.qp.showDay' : count === 1 ? 'calendar.qp.showDayOne' : 'calendar.qp.showDayMany';
      return { ...day, count, chooseLabel: translate(key, this.locale.locale(), { date: day.longLabel, count }) };
    }),
  );

  /** All-day and multi-day items, clipped to this week, in lanes. Columns are 1–7. */
  protected readonly spans = computed<Span[]>(() => {
    const dates = weekDays(this.weekStart());
    const entries = this.items()
      .filter((i) => i.spansDays && i.firstDate <= dates[6] && i.lastDate >= dates[0])
      .sort(byStart)
      .map((item) => ({
        item,
        start: Math.max(0, dates.indexOf(item.firstDate) === -1 ? 0 : dates.indexOf(item.firstDate)) + 1,
        end: (dates.indexOf(item.lastDate) === -1 ? 6 : dates.indexOf(item.lastDate)) + 2,
      }));
    return lanes(entries);
  });

  /**
   * Timed items per day on the desktop grid. Two or more starting at the same minute are one group (#729): their time,
   * then each on its own row, tall enough to read. Hidden unavailable time stays an edge marker.
   */
  protected readonly timed = computed(() =>
    this.days().map((day) => {
      const entries = day.items
        .filter((i) => !i.spansDays)
        .map((item) => {
          const minute = minutesOfDay(item.start);
          const row = Math.floor(minute / SLOT) + 1;
          const span = Math.max(MIN_SLOTS, Math.ceil((minutesOfDay(item.end) - minute || 60) / SLOT));
          return { item, start: row, end: row + span, row, span, minute };
        });
      const shown = entries.filter((e) => !e.item.concealed);
      const byMinute = new Map<number, typeof shown>();
      for (const entry of shown) byMinute.set(entry.minute, [...(byMinute.get(entry.minute) ?? []), entry]);
      const blocks = [...byMinute.values()].flatMap((same) => {
        if (same.length < 2) return same.map((entry) => ({ ...entry, group: null as CalendarItem[] | null, heading: '' }));
        const needed = Math.ceil((GROUP_HEAD_PX + same.length * GROUP_ROW_PX) / HALF_HOUR_PX);
        const span = Math.max(needed, ...same.map((e) => e.span));
        const time = timeLabel(same[0].item.start.slice(11), this.locale.locale() === 'en' ? 'en-US' : this.locale.locale());
        return [{
          ...same[0],
          span,
          end: same[0].row + span,
          group: same.map((e) => e.item),
          heading: translate('calendar.qp.sameTimeShort', this.locale.locale(), { time, count: same.length }),
        }];
      }).sort((a, b) => a.start - b.start);
      const placed = lanes(blocks);
      return {
        date: day.date,
        label: day.longLabel,
        placed,
        markers: entries.filter((e) => e.item.concealed),
        lanes: Math.max(1, ...placed.map((p) => p.lane)),
      };
    }),
  );

  protected readonly tint = cardTint;
  protected readonly markerLabel = (item: CalendarItem) => itemSummary(item, this.locale.locale());

  protected readonly hourMarks = computed(() =>
    Array.from({ length: 24 }, (_, hour) => ({
      label: hourLabel(hour, this.locale.locale()),
      row: hour * 2 + 1,
    })),
  );

  /** The earliest timed item this week, or 8 AM (#729). */
  private readonly firstHour = computed(() =>
    Math.min(OPENING_HOUR, ...this.items().filter((i) => !i.spansDays && !i.concealed).map((i) => Math.floor(minutesOfDay(i.start) / 60))),
  );

  /** Phones (#729): the chosen day, and which way its agenda slides in. */
  private readonly chosen = signal<PlainDate | null>(null);
  protected readonly slide = signal<'next' | 'previous' | null>(null);
  protected readonly selectedDay = computed(() => {
    const dates = weekDays(this.weekStart());
    const chosen = this.chosen();
    if (chosen && dates.includes(chosen)) return chosen;
    const anchor = this.anchor();
    if (anchor && dates.includes(anchor)) return anchor;
    return dates.includes(this.today()) ? this.today() : dates[0];
  });

  protected choose(date: PlainDate): void {
    const current = this.selectedDay();
    if (date === current) return;
    this.slide.set(date > current ? 'next' : 'previous');
    this.chosen.set(date);
  }

  /** The chosen day's agenda: all-day items first, then by time; events at the same time are grouped. */
  protected readonly agenda = computed(() => {
    const date = this.selectedDay();
    const locale = this.locale.locale();
    const day = this.days().find((d) => d.date === date)!;
    const shown = day.items.filter((i) => !i.concealed);
    const allDay = shown.filter((i) => i.spansDays);
    const timed = shown.filter((i) => !i.spansDays);
    const groups: { key: string; heading: string | null; items: CalendarItem[] }[] = [];
    for (const item of timed) {
      const last = groups.at(-1);
      if (last && last.items[0].start === item.start) last.items.push(item);
      else groups.push({ key: item.id, heading: null, items: [item] });
    }
    for (const group of groups) {
      if (group.items.length > 1) {
        const time = timeLabel(group.items[0].start.slice(11), locale === 'en' ? 'en-US' : locale);
        group.heading = translate('calendar.qp.sameTime', locale, { time, count: group.items.length });
      }
    }
    return {
      date,
      title: day.longLabel,
      isToday: day.isToday,
      allDay,
      groups,
      concealed: day.items.filter((i) => i.concealed),
      empty: shown.length === 0,
    };
  });

  constructor() {
    super();
    // Another week clears the highlight and the chosen day.
    effect(() => {
      this.weekStart();
      untracked(() => {
        this.pick.clear();
        this.chosen.set(null);
        this.slide.set(null);
      });
    });
    afterRenderEffect(() => {
      const scroller = this.scroller()?.nativeElement;
      const hour = this.firstHour();
      this.weekStart();
      if (scroller) {
        // Exactly on an hour line, so the grid opens on a complete time row (#729).
        scroller.scrollTop = hour * 2 * HALF_HOUR_PX;
      }
    });
  }
}
