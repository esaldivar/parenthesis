import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon } from '../../shared/icon/icon';
import { ChildAvatars } from './child-avatars';
import { DashboardDataSource, LiveDashboardDataSource, SampleDashboardDataSource } from './dashboard-data';
import { childNames, groupParentingTime } from './grouping';
import { DashboardWeek, PlainDate } from './model';
import { StatusLabel } from './status-label';
import { WeekCalendar, WeekState } from './week-calendar';
import { addDays, dateTimeLabel, dayLong, greetingFor, hourIn, nowIn, startOfWeek, timeLabel, todayIn } from './week';

/** The current time; replaced in tests. */
export const NOW = new InjectionToken<() => Date>('NOW', { factory: () => () => new Date() });

/**
 * The parent dashboard (docs/design/DASHBOARD.md): greeting, this week's calendar, the next handoff, items that need
 * this parent's review, upcoming events and shared memories.
 *
 * Until the calendar, approvals and memories APIs exist, the live dashboard shows honest "not available yet" states.
 * In development builds, `?sample=1` previews the layout with clearly labelled synthetic data.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, EmptyState, Icon, WeekCalendar, ChildAvatars, StatusLabel],
  providers: [{ provide: DashboardDataSource, useExisting: LiveDashboardDataSource }],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthStore);
  private readonly liveSource = inject(DashboardDataSource);
  private readonly now = inject(NOW)();

  /** `?sample=1`, honoured only in development builds. */
  readonly sample = input<string>();
  protected readonly showingSample = computed(() => isDevMode() && this.sample() === '1');

  private readonly timeZone = computed(() => this.auth.currentFamily()?.timeZone ?? 'UTC');
  protected readonly today = computed(() => todayIn(this.timeZone(), this.now));
  protected readonly currentWeekStart = computed(() => startOfWeek(this.today()));
  protected readonly weekStart = signal<PlainDate | null>(null);
  protected readonly shownWeek = computed(() => this.weekStart() ?? this.currentWeekStart());
  protected readonly isCurrentWeek = computed(() => this.shownWeek() === this.currentWeekStart());

  /** "Show children separately this week": a view choice that resets when the week changes and never edits data. */
  protected readonly split = signal(false);

  protected readonly state = signal<WeekState>('loading');
  protected readonly week = signal<DashboardWeek | null>(null);
  private requestId = 0;

  protected readonly greeting = computed(() => {
    const firstName = this.auth.user()?.displayName.split(/\s+/)[0];
    const hello = greetingFor(hourIn(this.timeZone(), this.now));
    return firstName ? `${hello}, ${firstName}` : hello;
  });
  protected readonly todayLabel = computed(() => dayLong(this.today()));
  protected readonly familyName = computed(() => this.auth.currentFamily()?.name ?? '');

  /** Every confirmed arrangement that starts at the next handoff moment (children may change hands together or not). */
  protected readonly nextHandoffs = computed(() => {
    const nowLocal = nowIn(this.timeZone(), this.now);
    const upcoming = groupParentingTime(this.week()?.parentingTime ?? [], { split: false }).filter(
      (b) => b.status === 'confirmed' && b.start > nowLocal,
    );
    const next = upcoming[0]?.start;
    return next ? upcoming.filter((b) => b.start === next) : [];
  });

  protected readonly upcomingEvents = computed(() =>
    (this.week()?.events ?? [])
      .filter((e) => e.date >= this.today())
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))),
  );

  protected readonly childNames = childNames;
  protected readonly dateTimeLabel = dateTimeLabel;
  protected readonly dayLong = dayLong;
  protected readonly timeLabel = timeLabel;

  constructor() {
    effect(() => {
      const weekStart = this.shownWeek();
      const familyId = this.auth.currentFamily()?.id;
      const source = this.showingSample() ? new SampleDashboardDataSource() : this.liveSource;
      untracked(() => void this.load(source, familyId, weekStart));
    });
  }

  protected goToWeek(offsetWeeks: number): void {
    this.split.set(false);
    this.weekStart.set(addDays(this.shownWeek(), offsetWeeks * 7));
  }

  protected goToThisWeek(): void {
    this.split.set(false);
    this.weekStart.set(null);
  }

  protected setSplit(split: boolean): void {
    this.split.set(split);
  }

  protected reload(): void {
    const source = this.showingSample() ? new SampleDashboardDataSource() : this.liveSource;
    void this.load(source, this.auth.currentFamily()?.id, this.shownWeek());
  }

  private async load(source: DashboardDataSource, familyId: string | undefined, weekStart: PlainDate): Promise<void> {
    const request = ++this.requestId;
    this.state.set('loading');
    try {
      const week = familyId ? await source.load(familyId, weekStart) : null;
      if (request !== this.requestId) {
        return; // A newer week was requested meanwhile.
      }
      this.week.set(week);
      this.state.set(week ? 'ready' : 'unavailable');
    } catch {
      if (request === this.requestId) {
        this.week.set(null);
        this.state.set('error');
      }
    }
  }
}
