import { CalendarPalette } from '../calendar/calendar-palette';
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
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../shared/avatar/avatar';
import { Icon } from '../../shared/icon/icon';
import { AddAt, SlotPick, addFromColumn, clearsPick, dayInRow, pickLabel, pickRows, pickText } from '../calendar/slot';
import { CalendarKey } from './calendar-key';
import { DashboardChildFilter } from './dashboard-child-filter';
import { ScheduleBlock, WeekPlacement, blockRange, childNames, groupParentingTime, placeInWeek } from './grouping';
import { DashboardWeek, FamilyEvent, PlainDate, eventPalette } from './model';
import { StatusLabel } from './status-label';
import { CATEGORY_ICONS, TimedPlacement, placeDay, visibleHours } from './timeline';
import {
  addDays,
  dayLong,
  hourLabel,
  monthDay,
  timeLabel,
  weekDays,
  weekLabelLong,
  weekdayShort,
} from './week';

export type WeekState = 'loading' | 'unavailable' | 'error' | 'ready';
export type InlineView = 'week' | 'list';

interface DayView {
  readonly date: PlainDate;
  readonly weekday: string;
  readonly monthDay: string;
  readonly longLabel: string;
  readonly isToday: boolean;
  readonly events: readonly (FamilyEvent & { readonly palette: import('../calendar/calendar-palette').CalendarPaletteKey })[];
  readonly placements: Map<string, TimedPlacement>;
  readonly lanes: number;
}

/** An all-day or multi-day event, placed like parenting time across its dates. */
interface AllDayEvent {
  readonly key: string;
  readonly start: string;
  readonly end: string;
  readonly event: FamilyEvent & { readonly palette: import('../calendar/calendar-palette').CalendarPaletteKey };
}

/** All-day events and events over several dates go in the all-day row; single-day timed ones in the hour grid. */
const inAllDayRow = (event: FamilyEvent) => !event.time || !!event.endDate;

/**
 * The dashboard's weekly calendar, laid out as the approved dashboard (docs/design/APPROVED_DASHBOARD_2026-10-16.md):
 * a toolbar, an all-day row where each parenting-time arrangement is one continuous block with the parent's and
 * children's avatars, and timed activities in their slots below. Purely presentational; grouping and child filtering are
 * view choices and never change data.
 */
@Component({
  selector: 'app-week-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarPalette, MatButtonModule, RouterLink, Avatar, Icon, StatusLabel, CalendarKey, DashboardChildFilter],
  templateUrl: './week-calendar.html',
  styleUrl: './week-calendar.scss',
})
export class WeekCalendar {
  readonly weekStart = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly isCurrentWeek = input.required<boolean>();
  readonly state = input.required<WeekState>();
  readonly week = input<DashboardWeek | null>(null);
  readonly selectedChild = input<string | null>(null);
  readonly view = input<InlineView>('week');

  readonly previousWeek = output();
  readonly nextWeek = output();
  readonly goToToday = output();
  readonly viewChange = output<InlineView>();
  readonly childChange = output<string | null>();
  readonly retry = output();
  /** Opens an event's details over the page (#213), with the calendar event's id. */
  readonly openEvent = output<string>();
  /** A tap on empty space (#212): add on that day, at the half-hour tapped in the time grid. */
  readonly add = output<AddAt>();

  /** The highlighted time or day (#237): a first tap highlights it, a tap on the highlight adds there. */
  protected readonly pick = new SlotPick((at) => this.add.emit(at));
  protected readonly pickLabel = pickLabel;
  protected readonly pickRows = pickRows;
  protected readonly pickText = pickText;
  /** The highlighted day's column in the all-day row (1–7), for a whole-day highlight. */
  protected readonly pickColumn = computed(() => {
    const at = this.pick.at();
    const index = at && !at.time ? this.days().findIndex((d) => d.date === at.date) : -1;
    return index === -1 ? null : index + 1;
  });

  protected addInColumn(event: MouseEvent, date: PlainDate): void {
    this.pick.tap(addFromColumn(event, date, this.hours().startHour, this.hours().endHour), event.detail !== 0);
  }

  protected addInAllDayRow(event: MouseEvent): void {
    const date = dayInRow(event, this.days().map((d) => d.date));
    if (date) {
      this.pick.tap({ date }, true);
    }
  }

  protected addOnDay(date: PlainDate): void {
    this.pick.tap({ date }, true);
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

  /** Only live data has real events to open or a real calendar to add to; the development sample doesn't. */
  protected readonly live = computed(() => this.week()?.source === 'live');

  /** The calendar event behind a parenting-time block (a grouped block opens its first child's event). */
  protected eventOf(block: ScheduleBlock): string | null {
    return block.items.find((i) => i.eventId)?.eventId ?? null;
  }

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly label = computed(() => weekLabelLong(this.weekStart()));
  private readonly events = computed(() => (this.week()?.events ?? []).map(event => ({ ...event, palette: eventPalette(event.category) })));
  /** The whole day is in the grid; it scrolls (see constructor) to where this week's activities begin. */
  protected readonly hours = computed(() => ({ startHour: 0, endHour: 24 }));
  protected readonly rows = computed(() => (this.hours().endHour - this.hours().startHour) * 2);
  /** 8 AM, or earlier when an activity this week starts earlier. */
  private readonly firstHour = computed(() => visibleHours(this.events()).startHour);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Another week clears the highlight.
    effect(() => {
      this.weekStart();
      untracked(() => this.pick.clear());
    });
    // Open each week (and the grid itself) scrolled to the morning. It reruns only when the week, its activities or
    // the grid change, never fighting the parent's own scrolling.
    afterRenderEffect(() => {
      const scroller = this.scroller()?.nativeElement;
      const hour = this.firstHour();
      this.weekStart();
      if (scroller) {
        scroller.scrollTop = ((hour - this.hours().startHour) * 2 * scroller.scrollHeight) / this.rows();
      }
    });
  }
  protected readonly hourMarks = computed(() => {
    const { startHour, endHour } = this.hours();
    const marks: { label: string; row: number }[] = [];
    for (let hour = startHour; hour < endHour; hour += 2) {
      marks.push({ label: hourLabel(hour), row: (hour - startHour) * 2 + 1 });
    }
    return marks;
  });

  protected readonly days = computed<DayView[]>(() =>
    weekDays(this.weekStart()).map((date) => {
      // Every event covering this date (a multi-day one on each of its dates), for the day's list.
      const events = this.events()
        .filter((e) => e.date <= date && (e.endDate ?? e.date) >= date)
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
      // Only single-day timed events take a place in the hour grid; the rest are in the all-day row (#208).
      const { placements, lanes } = placeDay(
        events.filter((e) => !inAllDayRow(e)),
        this.hours().startHour,
      );
      return {
        date,
        weekday: weekdayShort(date),
        monthDay: monthDay(date),
        longLabel: dayLong(date),
        isToday: date === this.today(),
        events,
        placements,
        lanes,
      };
    }),
  );

  private readonly blocks = computed(() => groupParentingTime(this.week()?.parentingTime ?? [], { split: false }));
  /**
   * The all-day row: the schedule (confirmed and rejected arrangements) first, then proposals, which take their own
   * lane beneath it. Proposals are hatched, outlined and labelled "Proposed · Needs approval", so they never read as
   * part of the schedule (approved by the user on October 17, 2026).
   */
  protected readonly allDay = computed(() => [
    ...this.blocks().filter((b) => b.status !== 'proposed'),
    ...this.blocks().filter((b) => b.status === 'proposed'),
  ]);
  /**
   * All-day and multi-day events (an all-day activity, a holiday, a trip, a day of unavailable time) as blocks across
   * their dates in the all-day row, after parenting time. Before, the desktop grid left them out entirely (#208).
   */
  protected readonly allDayEvents = computed<readonly AllDayEvent[]>(() =>
    this.events()
      .filter(inAllDayRow)
      .map((event) => ({
        key: `event:${event.id}`,
        start: `${event.date}T00:00`,
        end: `${addDays(event.endDate ?? event.date, 1)}T00:00`,
        event,
      })),
  );
  protected readonly placements = computed(() => placeInWeek([...this.allDay(), ...this.allDayEvents()], this.weekStart()));
  protected readonly allDayLanes = computed(() => Math.max(1, ...[...this.placements().values()].map((p) => p.lane + 1)));

  protected readonly childNames = childNames;
  protected readonly parentNames = (event: FamilyEvent) => (event.parents ?? []).map((p) => p.displayName).join(' and ');
  protected readonly timeLabel = timeLabel;
  /** "All day", "Oct 23 – Oct 24 · All day", or "Oct 23, 8:00 AM – Oct 24" for a timed multi-day event. */
  protected readonly allDayWhen = (event: FamilyEvent) => {
    const last = event.endDate ?? event.date;
    const days = last > event.date ? `${monthDay(event.date)} – ${monthDay(last)}` : '';
    if (event.time) {
      return `${monthDay(event.date)}, ${timeLabel(event.time)} – ${monthDay(last)}`;
    }
    return days ? `${days} · All day` : 'All day';
  };

  /** "5:00 PM · Kai · with Alex and Sam" (or when an all-day event is), leaving out whatever an event doesn't have (no stray separators). */
  protected readonly actMeta = (event: FamilyEvent) =>
    [
      inAllDayRow(event) ? this.allDayWhen(event) : timeLabel(event.time!),
      event.children.length ? childNames(event.children) : null,
      event.parents?.length ? `with ${this.parentNames(event)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  protected readonly icons = CATEGORY_ICONS;

  protected placement(block: Pick<ScheduleBlock, 'key'>): WeekPlacement | undefined {
    return this.placements().get(block.key);
  }

  protected readonly range = blockRange;

  protected isExpanded(block: ScheduleBlock): boolean {
    return this.expanded().has(block.key);
  }

  protected toggleDetails(block: ScheduleBlock): void {
    const next = new Set(this.expanded());
    if (!next.delete(block.key)) {
      next.add(block.key);
    }
    this.expanded.set(next);
  }

  /** Safe for use in element ids. */
  protected idFor(block: ScheduleBlock): string {
    return 'block-' + block.key.replace(/[^\w-]/g, '_');
  }
}
