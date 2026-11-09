import { inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe } from '../../core/i18n/translations';
import { CalendarPalette } from './calendar-palette';
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
  untracked,
  viewChild,
} from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { dayLong, dayOfMonth, hourLabel, monthDay, weekDays, weekdayShort } from '../dashboard/week';
import { AddAt, SlotPick, addFromColumn, clearsPick, dayInRow, pickLabel, pickRows, pickText } from './slot';
import { CalendarItem, byStart, onDate } from './calendar-items';
import { ItemText, itemSummary } from './item-text';
import { minutesOfDay } from './time';

const SLOT = 30;
const MIN_SLOTS = 2;
const DAY_MINUTES = 24 * 60;
// Allow a 24px-high button plus a gap for short events when there is space before midnight.
const MOBILE_MIN_MINUTES = 16;

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

/** Give each cluster of overlapping events its own set of lanes. Later events can use the full column again. */
function narrowPlacements(entries: readonly { item: CalendarItem; minute: number; endMinute: number }[]) {
  const placed = lanes(entries.map(({ item, minute, endMinute }) => ({
    item,
    start: minute,
    end: Math.min(DAY_MINUTES, Math.max(minute + MOBILE_MIN_MINUTES, endMinute)),
  })));
  const positions = new Map<CalendarItem, { top: number; height: number; left: number; width: number }>();

  for (let first = 0; first < placed.length;) {
    let last = first + 1;
    let end = placed[first].end;
    let count = placed[first].lane;
    while (last < placed.length && placed[last].start < end) {
      end = Math.max(end, placed[last].end);
      count = Math.max(count, placed[last].lane);
      last++;
    }
    for (const entry of placed.slice(first, last)) {
      positions.set(entry.item, {
        top: entry.start / DAY_MINUTES * 100,
        height: (entry.end - entry.start) / DAY_MINUTES * 100,
        left: (entry.lane - 1) / count * 100,
        width: 100 / count,
      });
    }
    first = last;
  }
  return positions;
}

/**
 * The Week view (the default). All-day and multi-day items sit in the all-day row across their own dates only;
 * timed items sit in their slots, side by side when they overlap. The same grid adapts to narrow screens.
 * Every item is a button that opens its details.
 */
@Component({
  selector: 'app-calendar-week',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, ItemText],
  templateUrl: './calendar-week.html',
  styleUrl: './calendar-week.scss',
})
export class CalendarWeek {
  private readonly locale = inject(LocaleService);
  readonly weekStart = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
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

  /** Timed items per day, using the desktop grid and exact minute positions on narrow screens. */
  protected readonly timed = computed(() =>
    this.days().map((day) => {
      const entries = day.items
        .filter((i) => !i.spansDays)
        .map((item) => {
          const minute = minutesOfDay(item.start);
          const endMinute = item.end.slice(0, 10) > day.date ? DAY_MINUTES : minutesOfDay(item.end);
          const row = Math.floor(minute / SLOT) + 1;
          const span = Math.max(MIN_SLOTS, Math.ceil((minutesOfDay(item.end) - minute || 60) / SLOT));
          return { item, start: row, end: row + span, row, span, minute, endMinute };
        });
      // Desktop keeps hidden unavailable time as an edge marker. On narrow screens give it its own
      // space in an overlap so it can't cover an already narrow event button.
      const placed = lanes(entries.filter((e) => !e.item.concealed));
      const markers = entries.filter((e) => e.item.concealed);
      const narrow = narrowPlacements(entries);
      return {
        date: day.date,
        label: day.longLabel,
        placed: placed.map((entry) => ({ ...entry, narrow: narrow.get(entry.item)! })),
        markers: markers.map((entry) => ({ ...entry, narrow: narrow.get(entry.item)! })),
        lanes: Math.max(1, ...placed.map((p) => p.lane)),
      };
    }),
  );

  protected readonly markerLabel = (item: CalendarItem) => itemSummary(item, this.locale.locale());

  protected readonly hourMarks = computed(() =>
    Array.from({ length: 24 }, (_, hour) => ({
      label: hourLabel(hour, this.locale.locale()),
      row: hour * 2 + 1,
    })),
  );

  /** The earliest timed item this week, or 7 AM. */
  private readonly firstHour = computed(() =>
    Math.min(7, ...this.items().filter((i) => !i.spansDays).map((i) => Math.floor(minutesOfDay(i.start) / 60))),
  );

  constructor() {
    // Another week clears the highlight.
    effect(() => {
      this.weekStart();
      untracked(() => this.pick.clear());
    });
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
