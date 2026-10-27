import { CalendarPalette } from '../calendar/calendar-palette';
import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarEvent, FamilyMember } from '../../core/api/api';
import { toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { CalendarItem, swapTargetFor, toItems } from '../calendar/calendar-items';
import { EventDetails } from '../calendar/event-details';
import { AddAt, addQuery } from '../calendar/slot';
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
import { Toasts } from '../../shared/toast/toasts';

/** The current time; replaced in tests. */
export const NOW = new InjectionToken<() => Date>('NOW', { factory: () => () => new Date() });

interface UpcomingItem {
  readonly key: string;
  readonly icon: IconName;
  readonly category: string;
  readonly palette?: string;
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
  imports: [CalendarPalette, RouterLink, MatButtonModule, EmptyState, Icon, Avatar, Leaves, StatusLabel, WeekCalendar, EventDetails],
  providers: [{ provide: DashboardDataSource, useExisting: LiveDashboardDataSource }],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly injector = inject(Injector);
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
        palette: b.caregiver.palette ?? 'parenting',
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

  /** The event whose details are open over the page (#213), with what the details need. */
  protected readonly details = signal<{
    readonly item: CalendarItem;
    readonly event: CalendarEvent;
    readonly members: readonly FamilyMember[];
    readonly familyId: string;
    /** For unavailable time: that parent's confirmed parenting time it overlaps, so a swap can be offered (#190). */
    readonly swapTarget: CalendarItem | null;
  } | null>(null);
  protected readonly familyTimeZone = this.timeZone;
  private opener: HTMLElement | null = null;
  private opening = 0;

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
    // Back/forward or a linked week can change the URL while this component stays mounted.
    // Drop the immediate button selection so the router-bound week becomes authoritative again.
    effect(() => {
      this.week();
      untracked(() => this.chosenWeek.set(null));
    });

    effect(() => {
      const weekStart = this.shownWeek();
      const familyId = this.auth.currentFamily()?.id;
      const source = this.showingSample() ? new SampleDashboardDataSource() : this.liveSource;
      untracked(() => void this.load(source, familyId, weekStart));
    });
  }

  protected goToWeek(offsetWeeks: number): void {
    this.chooseWeek(addDays(this.shownWeek(), offsetWeeks * 7));
  }

  protected goToToday(): void {
    this.chooseWeek(this.currentWeekStart());
  }

  private chooseWeek(week: PlainDate): void {
    this.split.set(false);
    this.chosenWeek.set(week);
    // Keep the selected week in this history entry, so Settings/theme changes and reload retain it.
    void this.router.navigate([], { queryParams: { week }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setSplit(split: boolean): void {
    this.split.set(split);
  }

  protected showMemory(offset: number): void {
    const count = this.memories().length;
    this.memoryIndex.set((this.memoryIndex() + offset + count) % count);
  }

  /**
   * Opens an event's details over the home page (#213), as the Calendar page does: the same sheet, permissions and
   * actions, loaded fresh so it's never stale. Opening it changes nothing. Closing it returns focus to the block.
   */
  protected async openEvent(eventId: string): Promise<void> {
    const familyId = this.auth.currentFamily()?.id;
    if (!familyId) {
      return;
    }
    const attempt = ++this.opening;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const [event, family, children] = await Promise.all([
        this.api.calendarEvent(familyId, eventId),
        this.api.family(familyId),
        this.api.children(familyId),
      ]);
      if (attempt !== this.opening) {
        return;
      }
      const item = toItems([event], family.members, children, this.timeZone(), family.createdAt).find((i) => i.id === eventId);
      if (!item) {
        throw new Error('Not shown on the calendar');
      }
      // As on the Calendar page: unavailable time over that parent's parenting time offers a swap.
      const overlapping = item.kind === 'unavailable' ? await this.api.calendarEvents(familyId, event.startsAt, event.endsAt) : [];
      if (attempt !== this.opening) {
        return;
      }
      const swapTarget = swapTargetFor(item, toItems(overlapping, family.members, children, this.timeZone(), family.createdAt));
      this.details.set({ item, event, members: family.members, familyId, swapTarget });
    } catch (error) {
      if (attempt === this.opening) {
        this.toasts.show(
          toProblem(error).status === 404
            ? 'That event isn’t on the calendar any more. The week has been refreshed.'
            : 'We couldn’t open that event. Try again, or find it on the Calendar page.',
        );
        this.reload();
      }
    }
  }

  /** A tap on empty space on the week (#212): the Add page on that date (and half-hour). Nothing is saved yet. */
  protected addAt(at: AddAt): void {
    void this.router.navigate(['/calendar/new'], { queryParams: addQuery(at) });
  }

  protected closeDetails(): void {
    this.details.set(null);
    const opener = this.opener;
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  /** Something changed from the details (a cancellation, an answer): say so and refresh the week. */
  protected detailsChanged(message: string): void {
    this.details.set(null);
    this.toasts.show(message);
    this.reload();
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
