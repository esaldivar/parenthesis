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
import { Avatar } from '../../shared/avatar/avatar';
import { Leaves } from '../../shared/decor/leaves';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon, IconName } from '../../shared/icon/icon';
import { DashboardDataSource, LiveDashboardDataSource, SampleDashboardDataSource } from './dashboard-data';
import { blockRange, childNames, groupParentingTime } from './grouping';
import { DashboardWeek, PlainDate, ScheduleStatus } from './model';
import { StatusLabel } from './status-label';
import { CATEGORY_ICONS } from './timeline';
import { InlineView, WeekCalendar, WeekState } from './week-calendar';
import { addDays, dateMedium, dateTimeLabel, dayLong, greetingFor, hourIn, nowIn, startOfWeek, timeLabel, todayIn } from './week';

/** The current time; replaced in tests. */
export const NOW = new InjectionToken<() => Date>('NOW', { factory: () => () => new Date() });

interface UpcomingItem {
  readonly key: string;
  readonly icon: IconName;
  readonly category: string;
  readonly title: string;
  readonly when: string;
  readonly people: readonly { name: string; kind: 'parent' | 'child' }[];
  readonly status: ScheduleStatus;
  readonly note?: string;
  readonly link?: string;
}

/**
 * The parent dashboard, built to the approved design (docs/design/APPROVED_DASHBOARD_2026-10-16.md): greeting, the
 * weekly calendar as the centrepiece, Upcoming and Quick Add, then From Your Kids, Recent Messages and Family
 * Memories.
 *
 * The week, Upcoming and Quick Add use the real calendar, approvals, reminders and tasks (#196). Messages, memories and
 * children's shares keep honest "not available yet" states until those features exist. In development builds,
 * `?sample=1` previews the layout with clearly labelled synthetic data.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, EmptyState, Icon, Avatar, Leaves, StatusLabel, WeekCalendar],
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
  /** `?week=YYYY-MM-DD` (any day of the week), e.g. when coming back from the Calendar page. */
  readonly week = input<string>();

  protected readonly showingSample = computed(() => isDevMode() && this.sample() === '1');

  private readonly timeZone = computed(() => this.auth.currentFamily()?.timeZone ?? 'UTC');
  protected readonly today = computed(() => todayIn(this.timeZone(), this.now));
  protected readonly currentWeekStart = computed(() => startOfWeek(this.today()));
  private readonly chosenWeek = signal<PlainDate | null>(null);
  private readonly linkedWeek = computed(() => {
    const week = this.week();
    return week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? startOfWeek(week) : null;
  });
  protected readonly shownWeek = computed(() => this.chosenWeek() ?? this.linkedWeek() ?? this.currentWeekStart());
  protected readonly isCurrentWeek = computed(() => this.shownWeek() === this.currentWeekStart());

  /** "Show children separately this week": a view choice that resets when the week changes and never edits data. */
  protected readonly split = signal(false);
  protected readonly inlineView = signal<InlineView>('week');

  protected readonly state = signal<WeekState>('loading');
  protected readonly data = signal<DashboardWeek | null>(null);
  private requestId = 0;

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(/\s+/)[0] ?? '');
  protected readonly greeting = computed(() => {
    const hello = greetingFor(hourIn(this.timeZone(), this.now));
    return this.firstName() ? `${hello}, ${this.firstName()}!` : `${hello}!`;
  });

  /** Proposals awaiting this parent, then this week's parenting time and activities from today on. */
  protected readonly upcoming = computed<UpcomingItem[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const nowLocal = nowIn(this.timeZone(), this.now);
    const reviews: UpcomingItem[] = data.pendingReviews.map((r) => ({
      key: `review-${r.id}`,
      icon: 'approvals',
      category: 'review',
      title: r.summary,
      when: `Proposed by ${r.proposedBy} · needs your review`,
      people: [],
      status: 'proposed',
      link: '/approvals',
    }));
    const parenting: UpcomingItem[] = groupParentingTime(data.parentingTime, { split: false })
      .filter((b) => b.status === 'confirmed' && b.end > nowLocal)
      .map((b) => ({
        key: `pt-${b.key}`,
        icon: 'calendar',
        category: 'parenting',
        title: b.title,
        when: blockRange(b),
        people: [{ name: b.caregiver.displayName, kind: 'parent' as const }, ...b.children.map((c) => ({ name: c.name, kind: 'child' as const }))],
        status: b.status,
        note: b.changePending ? 'Change pending' : undefined,
      }));
    const events: (UpcomingItem & { sort: string })[] = data.events
      .filter((e) => e.date >= this.today())
      .map((e) => ({
        sort: e.date + (e.time ?? ''),
        key: `ev-${e.id}`,
        icon: CATEGORY_ICONS[e.category],
        category: e.category,
        title: e.title,
        when: e.time ? dateTimeLabel(`${e.date}T${e.time}`).replace(/, (\d)/, ' · $1') : dayLong(e.date),
        people: [
          ...(e.parents ?? []).map((p) => ({ name: p.displayName, kind: 'parent' as const })),
          ...e.children.map((c) => ({ name: c.name, kind: 'child' as const })),
        ],
        status: e.status,
      }));
    // Reminders and tasks due, in Upcoming only (owner decision, October 22, 2026); never on the week calendar.
    const notes: (UpcomingItem & { sort: string })[] = (data.notes ?? [])
      .filter((n) => n.date >= this.today())
      .map((n) => ({
        sort: n.date + (n.time ?? ''),
        key: `${n.kind}-${n.id}`,
        icon: n.kind === 'reminder' ? 'bell' : 'note',
        category: n.kind,
        title: n.title,
        when:
          n.kind === 'task'
            ? `Task · due ${dayLong(n.date)}`
            : `Reminder · ${n.time ? dateTimeLabel(`${n.date}T${n.time}`).replace(/, (\d)/, ' · $1') : dayLong(n.date)}`,
        people: n.children.map((c) => ({ name: c.name, kind: 'child' as const })),
        status: 'confirmed',
        link: '/calendar',
      }));
    const dated: UpcomingItem[] = [...events, ...notes].sort((a, b) => a.sort.localeCompare(b.sort));
    return [...reviews, ...parenting, ...dated].slice(0, 5);
  });

  protected readonly memoryIndex = signal(0);
  protected readonly memories = computed(() => this.data()?.recentMemories ?? []);
  protected readonly currentMemory = computed(() => this.memories()[this.memoryIndex()] ?? null);

  /**
   * As in the approved design. Event and Note open Add to calendar (a note is a shared reminder); messages and
   * memories don't exist yet, so those stay marked unavailable (owner decision, October 22, 2026).
   */
  protected readonly quickActions: readonly { label: string; icon: IconName; kind?: 'event' | 'reminder' }[] = [
    { label: 'Event', icon: 'calendar', kind: 'event' },
    { label: 'Message', icon: 'messages' },
    { label: 'Memory', icon: 'image' },
    { label: 'Note', icon: 'plus', kind: 'reminder' },
  ];

  protected readonly personRef = (person: { name: string }) => ({ id: person.name, name: person.name });
  protected readonly childNames = childNames;
  protected readonly dateMedium = dateMedium;
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
    this.chosenWeek.set(addDays(this.shownWeek(), offsetWeeks * 7));
  }

  protected goToToday(): void {
    this.split.set(false);
    this.chosenWeek.set(this.currentWeekStart());
  }

  protected setSplit(split: boolean): void {
    this.split.set(split);
  }

  protected showMemory(offset: number): void {
    const count = this.memories().length;
    this.memoryIndex.set((this.memoryIndex() + offset + count) % count);
  }

  protected reload(): void {
    const source = this.showingSample() ? new SampleDashboardDataSource() : this.liveSource;
    void this.load(source, this.auth.currentFamily()?.id, this.shownWeek());
  }

  private async load(source: DashboardDataSource, familyId: string | undefined, weekStart: PlainDate): Promise<void> {
    const request = ++this.requestId;
    this.state.set('loading');
    try {
      const data = familyId ? await source.load(familyId, weekStart) : null;
      if (request !== this.requestId) {
        return; // A newer week was requested meanwhile.
      }
      this.data.set(data);
      this.memoryIndex.set(0);
      this.state.set(data ? 'ready' : 'unavailable');
    } catch {
      if (request === this.requestId) {
        this.data.set(null);
        this.state.set('error');
      }
    }
  }
}
