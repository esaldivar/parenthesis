import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ChildAvatars } from './child-avatars';
import { ScheduleBlock, WeekPlacement, childNames, groupParentingTime, placeInWeek } from './grouping';
import { DashboardWeek, FamilyEvent, PlainDate } from './model';
import { StatusLabel } from './status-label';
import { dateTimeLabel, dayLong, dayOfMonth, timeLabel, weekDays, weekLabel, weekdayShort } from './week';

export type WeekState = 'loading' | 'unavailable' | 'error' | 'ready';

interface DayView {
  readonly date: PlainDate;
  readonly weekday: string;
  readonly dayNumber: string;
  readonly longLabel: string;
  readonly isToday: boolean;
  readonly events: readonly FamilyEvent[];
}

/**
 * The dashboard's "This week" calendar (docs/design/DASHBOARD.md). Purely presentational: it shows what it's given
 * and emits navigation and view choices. Splitting or grouping children is a view preference and never edits data.
 */
@Component({
  selector: 'app-week-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, ChildAvatars, StatusLabel],
  templateUrl: './week-calendar.html',
  styleUrl: './week-calendar.scss',
})
export class WeekCalendar {
  readonly weekStart = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly isCurrentWeek = input.required<boolean>();
  readonly state = input.required<WeekState>();
  readonly week = input<DashboardWeek | null>(null);
  readonly split = input(false);

  readonly previousWeek = output();
  readonly nextWeek = output();
  readonly thisWeek = output();
  readonly splitChange = output<boolean>();
  readonly retry = output();

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly label = computed(() => weekLabel(this.weekStart()));

  protected readonly days = computed<DayView[]>(() =>
    weekDays(this.weekStart()).map((date) => ({
      date,
      weekday: weekdayShort(date),
      dayNumber: dayOfMonth(date),
      longLabel: dayLong(date),
      isToday: date === this.today(),
      events: (this.week()?.events ?? [])
        .filter((e) => e.date === date)
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    })),
  );

  private readonly blocks = computed(() => groupParentingTime(this.week()?.parentingTime ?? [], { split: this.split() }));
  protected readonly agreed = computed(() => this.blocks().filter((b) => b.status !== 'proposed'));
  protected readonly proposed = computed(() => this.blocks().filter((b) => b.status === 'proposed'));
  protected readonly placements = computed(() => placeInWeek(this.agreed(), this.weekStart()));
  protected readonly lanes = computed(() => Math.max(1, ...[...this.placements().values()].map((p) => p.lane + 1)));

  /** The split toggle only matters when some block groups several children, or when split is on. */
  protected readonly canSplit = computed(
    () => this.split() || groupParentingTime(this.week()?.parentingTime ?? [], { split: false }).some((b) => b.children.length > 1),
  );

  protected readonly childNames = childNames;
  protected readonly timeLabel = timeLabel;

  protected placement(block: ScheduleBlock): WeekPlacement | undefined {
    return this.placements().get(block.key);
  }

  protected range(block: ScheduleBlock): string {
    return `${dateTimeLabel(block.start)} – ${dateTimeLabel(block.end)}`;
  }

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
