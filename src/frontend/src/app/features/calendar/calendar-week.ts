import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { dayLong, hourLabel, monthDay, weekDays, weekdayShort } from '../dashboard/week';
import { CalendarItem, byStart, onDate } from './calendar-items';
import { ItemText } from './item-text';
import { minutesOfDay } from './time';

const SLOT = 30;
const MIN_SLOTS = 2;

interface Span {
  readonly item: CalendarItem;
  readonly start: number;
  readonly end: number;
  readonly lane: number;
}

interface Timed {
  readonly item: CalendarItem;
  readonly row: number;
  readonly span: number;
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
 * The Week view (the default). All-day and multi-day items sit in the all-day row across their own dates only;
 * timed items sit in their slots, side by side when they overlap. On narrow screens it becomes a day-by-day list.
 * Every item is a button that opens its details.
 */
@Component({
  selector: 'app-calendar-week',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemText],
  templateUrl: './calendar-week.html',
  styleUrl: './calendar-week.scss',
})
export class CalendarWeek {
  readonly weekStart = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly selected = output<CalendarItem>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly days = computed(() =>
    weekDays(this.weekStart()).map((date) => ({
      date,
      weekday: weekdayShort(date),
      monthDay: monthDay(date),
      longLabel: dayLong(date),
      isToday: date === this.today(),
      items: onDate(this.items(), date).sort(byStart),
    })),
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
  protected readonly spanLanes = computed(() => Math.max(1, ...this.spans().map((s) => s.lane)));

  /** Timed items per day, in 30-minute rows and overlap lanes. */
  protected readonly timed = computed(() =>
    this.days().map((day) => {
      const entries = day.items
        .filter((i) => !i.spansDays)
        .map((item) => {
          const row = Math.floor(minutesOfDay(item.start) / SLOT) + 1;
          const span = Math.max(MIN_SLOTS, Math.ceil((minutesOfDay(item.end) - minutesOfDay(item.start) || 60) / SLOT));
          return { item, start: row, end: row + span, row, span };
        });
      const placed = lanes(entries) as Timed[];
      return { date: day.date, label: day.longLabel, placed, lanes: Math.max(1, ...placed.map((p) => p.lane)) };
    }),
  );

  protected readonly hourMarks = Array.from({ length: 12 }, (_, i) => ({ label: hourLabel(i * 2), row: i * 4 + 1 }));

  /** The earliest timed item this week, or 7 AM. */
  private readonly firstHour = computed(() =>
    Math.min(7, ...this.items().filter((i) => !i.spansDays).map((i) => Math.floor(minutesOfDay(i.start) / 60))),
  );

  constructor() {
    afterRenderEffect(() => {
      const scroller = this.scroller()?.nativeElement;
      const hour = this.firstHour();
      this.weekStart();
      if (scroller) {
        scroller.scrollTop = (hour / 24) * scroller.scrollHeight;
      }
    });
  }
}
