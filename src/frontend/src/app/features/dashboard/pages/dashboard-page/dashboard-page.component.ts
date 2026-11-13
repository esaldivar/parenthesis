import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { localizeSummary } from '../../../../core/i18n/change-request-summary';
import { TranslatePipe, TranslationKey, translate } from '../../../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { CalendarPalette, CalendarPaletteKey } from '../../../calendar/calendar-palette';
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
import { Api, CalendarEvent, FamilyMember } from '../../../../core/api/api';
import { toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { CalendarItem, swapTargetFor, toItems } from '../../../calendar/calendar-items';
import { monthGrid, startOfMonth } from '../../../calendar/components/calendar-month/calendar-month.component';
import { fromFamilyLocal } from '../../../calendar/time';
import { EventDetails } from '../../../calendar/components/event-details/event-details.component';
import { AddAt, addQuery } from '../../../calendar/slot';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Leaves } from '../../../../shared/components/decor/leaves';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { DashboardDataSource, LiveDashboardDataSource, SampleDashboardDataSource } from '../../data/dashboard-data';
import { blockRange, childNames, groupParentingTime } from '../../grouping';
import { DashboardWeek, ScheduleStatus, eventPalette } from '../../model';
import { PlainDate } from '../../../../core/dates/plain-date';
import { StatusLabel } from '../../components/status-label/status-label.component';
import { CATEGORY_ICONS } from '../../timeline';
import { InlineView, WeekCalendar, WeekState } from '../../components/week-calendar/week-calendar.component';
import { addDays, dateMedium, datePart, dateTimeLabel, dayLong, hourIn, nowIn, startOfWeek, timeLabel, todayIn } from '../../../../core/dates/dates';
import { greetingFor } from '../../greeting';
import { Toasts } from '../../../../shared/components/toast/toasts';

/** The current time; replaced in tests. */
export const NOW = new InjectionToken<() => Date>('NOW', { factory: () => () => new Date() });

interface UpcomingItem {
  readonly key: string;
  readonly icon: IconName;
  readonly category: string;
  readonly palette?: CalendarPaletteKey;
  readonly title: string;
  readonly when: string;
  readonly people: readonly { id: string; name: string; kind: 'parent' | 'child' }[];
  readonly status: ScheduleStatus;
  readonly note?: string;
  readonly link?: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly eventId?: string;
}

/**
 * The parent dashboard, built to the approved design (docs/design/APPROVED_DASHBOARD_2026-10-16.md): greeting, the
 * weekly calendar as the centrepiece, Upcoming and Quick Add, then From Your Kids and Family Memories. The owner
 * removed Recent Messages on November 7, 2026; Family Memories took its place.
 *
 * The week, Upcoming and Quick Add use the real calendar, approvals, reminders and tasks (#196). Children's shares keep an honest "not available yet" state until that feature exists. In development builds,
 * `?sample=1` previews the layout with clearly labelled synthetic data.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, CalendarPalette, RouterLink, MatButtonModule, EmptyState, Icon, Avatar, Leaves, StatusLabel, WeekCalendar, EventDetails, TranslatePipe],
  providers: [{ provide: DashboardDataSource, useExisting: LiveDashboardDataSource }],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPage {
  protected readonly locale = inject(LocaleService);
  protected readonly t = (key: TranslationKey) => translate(key, this.locale.locale());
  protected quickLabel(kind: 'event' | 'task' | 'reminder'): string {
    return this.t(({ event: 'dash.event', task: 'dash.task', reminder: 'dash.reminder' } as const)[kind]);
  }
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

  /** Dashboard-only filter, retained across week/list changes in this active page. */
  protected readonly selectedChild = signal<string | null>(null);
  private selectionFamily: string | undefined;
  protected readonly calendarWeek = computed(() => {
    const data = this.data();
    const child = this.selectedChild();
    if (!data || !child) return data;
    return {
      ...data,
      parentingTime: data.parentingTime.filter((p) => p.child.id === child),
      // Calendar's forChild rule: shared events appear once; child-free events always remain.
      events: data.events.filter((e) => (e.childIds ?? e.children.map((c) => c.id)).length === 0 || (e.childIds ?? e.children.map((c) => c.id)).includes(child)),
    };
  });
  private readonly selectedView = signal<InlineView>('week');
  private readonly desktop = toSignal(inject(BreakpointObserver).observe('(min-width: 1024px)'), { requireSync: true });
  protected readonly desktopMonth = computed(() => this.desktop().matches && !this.showingSample());
  protected readonly inlineView = computed(() => {
    const view = this.selectedView();
    return view === 'month' && !this.desktopMonth() ? 'week' : view;
  });
  protected readonly monthDate = signal<PlainDate | null>(null);
  protected readonly monthState = signal<WeekState>('loading');
  private readonly monthItems = signal<readonly (CalendarItem & { readonly childIds: readonly string[] })[]>([]);
  protected readonly filteredMonthItems = computed(() => {
    const child = this.selectedChild();
    const items = this.monthItems();
    return child ? items.filter(item => item.childIds.length === 0 || item.childIds.includes(child)) : items;
  });
  private readonly monthRefresh = signal(0);
  private monthRequest = 0;

  protected readonly state = signal<WeekState>('loading');
  protected readonly data = signal<DashboardWeek | null>(null);
  private requestId = 0;

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(/\s+/)[0] ?? '');
  protected readonly greetingText = computed(() => greetingFor(hourIn(this.timeZone(), this.now)));
  protected readonly localizedGreeting = computed(() => {
    const greeting = this.greetingText();
    return this.t(greeting === 'Hello' ? 'dash.hello' : greeting === 'Good afternoon' ? 'dash.afternoon' : greeting === 'Good evening' ? 'dash.evening' : 'dash.morning');
  });
  protected readonly greeting = computed(() => {
    const greeting = this.localizedGreeting();
    const name = this.firstName();
    return name
      ? translate('dash.greetingNamed', this.locale.locale(), { greeting, name })
      : translate('dash.greetingPlain', this.locale.locale(), { greeting });
  });

  /** Proposals awaiting this parent, then this week's parenting time and activities from today on. */
  protected readonly upcoming = computed<UpcomingItem[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const locale = this.locale.locale();
    const nowLocal = nowIn(this.timeZone(), this.now);
    const reviews: UpcomingItem[] = data.pendingReviews.map((r) => ({
      key: `review-${r.id}`,
      icon: 'approvals',
      category: 'review',
      title: localizeSummary(r, locale),
      when: translate('dash.proposedReview', this.locale.locale(), { name: r.proposedBy }),
      people: [],
      status: 'proposed',
      link: '/approvals',
      params: { request: r.id },
    }));
    const parenting: UpcomingItem[] = groupParentingTime(data.parentingTime, { split: false, locale })
      .filter((b) => b.status === 'confirmed' && b.end > nowLocal)
      .map((b) => ({
        key: `pt-${b.key}`,
        icon: 'calendar',
        category: 'parenting',
        palette: b.caregiver.palette ?? 'parenting',
        title: b.title,
        when: blockRange(b, locale),
        people: [
          { id: b.caregiver.membershipId, name: b.caregiver.displayName, kind: 'parent' },
          ...b.children.map((child) => ({ ...child, kind: 'child' as const })),
        ],
        status: b.status,
        note: b.changePending ? this.t('calendar.filter.change-pending') : undefined,
        eventId: b.items[0].eventId && b.items.every((entry) => entry.eventId === b.items[0].eventId) ? b.items[0].eventId : undefined,
        link: '/calendar',
        params: { date: datePart(b.start) },
      }));
    const events: (UpcomingItem & { sort: string })[] = data.events
      .filter((e) => e.date >= this.today())
      .map((e) => ({
        sort: e.date + (e.time ?? ''),
        key: `ev-${e.id}`,
        icon: CATEGORY_ICONS[e.category],
        category: e.category,
        palette: eventPalette(e.category),
        title: e.title,
        when: e.time ? dateTimeLabel(`${e.date}T${e.time}`, locale).replace(/, (\d)/, ' · $1') : dayLong(e.date, locale),
        people: [
          ...(e.parents ?? []).map((p) => ({ id: p.membershipId, name: p.displayName, kind: 'parent' as const })),
          ...e.children.map((c) => ({ ...c, kind: 'child' as const })),
        ],
        status: e.status,
        eventId: e.id,
      }));
    // Reminders and tasks due, in Upcoming only (owner decision, October 22, 2026); never on the week calendar.
    const notes: (UpcomingItem & { sort: string })[] = (data.notes ?? [])
      .filter((n) => n.date >= this.today())
      .map((n) => ({
        sort: n.date + (n.time ?? ''),
        key: `${n.kind}-${n.id}`,
        icon: n.kind === 'reminder' ? 'bell' : 'note',
        category: n.kind,
        palette: n.kind,
        title: n.title,
        when:
          n.kind === 'task'
            ? translate('dash.taskDue', locale, { date: dayLong(n.date, locale) })
            : translate('dash.reminderWhen', locale, {
                date: n.time ? dateTimeLabel(`${n.date}T${n.time}`, locale).replace(/, (\d)/, ' · $1') : dayLong(n.date, locale),
              }),
        people: n.children.map((c) => ({ ...c, kind: 'child' as const })),
        status: 'confirmed',
        link: '/calendar',
        params: { view: 'list', date: n.date, event: n.id },
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

  protected readonly quickCalendarActions = [
    { label: 'Event', icon: 'calendar', kind: 'event' },
    { label: 'Task', icon: 'note', kind: 'task' },
    { label: 'Reminder', icon: 'bell', kind: 'reminder' },
  ] as const;

  protected readonly childNames = (children: Parameters<typeof childNames>[0]) => childNames(children, 3, this.locale.locale());
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

    effect(() => {
      const month = this.inlineView() === 'month' ? this.monthDate() : null;
      const family = this.auth.currentFamily();
      this.monthRefresh();
      if (month && family) {
        untracked(() => void this.loadMonth(family.id, family.timeZone, month));
      } else {
        this.monthRequest++;
      }
    });
  }

  protected selectView(view: InlineView): void {
    if (view === 'month' && this.inlineView() !== 'month') {
      this.monthDate.set(startOfMonth(this.shownWeek()));
    }
    this.selectedView.set(view);
  }

  protected openMonthDay(day: PlainDate): void {
    this.selectView('week');
    this.chooseWeek(startOfWeek(day));
  }

  private async loadMonth(familyId: string, zone: string, month: PlainDate): Promise<void> {
    const request = ++this.monthRequest;
    this.monthItems.set([]);
    this.monthState.set('loading');
    const dates = monthGrid(month);
    const from = fromFamilyLocal(`${dates[0]}T00:00`, zone);
    const to = fromFamilyLocal(`${addDays(dates[41], 1)}T00:00`, zone);
    try {
      const [events, family, children] = await Promise.all([
        this.api.calendarEvents(familyId, from, to), this.api.family(familyId), this.api.children(familyId),
      ]);
      if (request !== this.monthRequest) return;
      const schedule = events.filter(event => event.status === 'Confirmed' || event.status === 'PendingApproval');
      this.monthItems.set(toItems(schedule, family.members, children, zone, this.locale.locale()).map((item, index) => ({
        ...item, childIds: schedule[index].childIds,
      })));
      this.monthState.set('ready');
    } catch {
      if (request === this.monthRequest) this.monthState.set('error');
    }
  }

  protected stepCalendar(direction: -1 | 1): void {
    const month = this.monthDate();
    if (this.inlineView() === 'month' && month) {
      this.monthDate.set(startOfMonth(addDays(month, direction === -1 ? -1 : 32)));
      return;
    }
    this.chooseWeek(addDays(this.shownWeek(), direction * 7));
  }

  protected goToToday(): void {
    if (this.inlineView() === 'month') {
      this.monthDate.set(startOfMonth(this.today()));
      return;
    }
    this.chooseWeek(this.currentWeekStart());
  }

  private chooseWeek(week: PlainDate): void {
    this.chosenWeek.set(week);
    // Keep the selected week in this history entry, so Settings/theme changes and reload retain it.
    void this.router.navigate([], { queryParams: { week }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected showMemory(offset: number): void {
    const count = this.memories().length;
    this.memoryIndex.set((this.memoryIndex() + offset + count) % count);
  }

  /**
   * Opens an event's details over the home page (#213), as the Calendar page does: the same sheet, permissions and
   * actions, loaded fresh so it's never stale. Opening it changes nothing. Closing it returns focus to the block.
   */
  protected async openEvent(eventId: string, trigger?: HTMLElement): Promise<void> {
    const familyId = this.auth.currentFamily()?.id;
    if (!familyId) {
      return;
    }
    const attempt = ++this.opening;
    this.opener = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    try {
      const [event, family, children] = await Promise.all([
        this.api.calendarEvent(familyId, eventId),
        this.api.family(familyId),
        this.api.children(familyId),
      ]);
      if (attempt !== this.opening) {
        return;
      }
      const item = toItems([event], family.members, children, this.timeZone(), this.locale.locale()).find((i) => i.id === eventId);
      if (!item) {
        throw new Error(translate('dash.notShown', this.locale.locale()));
      }
      // As on the Calendar page: unavailable time over that parent's parenting time offers a swap.
      const overlapping = item.kind === 'unavailable' ? await this.api.calendarEvents(familyId, event.startsAt, event.endsAt) : [];
      if (attempt !== this.opening) {
        return;
      }
      const swapTarget = swapTargetFor(item, toItems(overlapping, family.members, children, this.timeZone(), this.locale.locale()));
      this.details.set({ item, event, members: family.members, familyId, swapTarget });
    } catch (error) {
      if (attempt === this.opening) {
        this.toasts.show(
          toProblem(error).status === 404
            ? translate('dash.eventGone', this.locale.locale())
            : translate('dash.openError', this.locale.locale()),
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
    if (this.inlineView() === 'month') this.monthRefresh.update(value => value + 1);
    const source = this.showingSample() ? new SampleDashboardDataSource() : this.liveSource;
    void this.load(source, this.auth.currentFamily()?.id, this.shownWeek());
  }

  private async load(source: DashboardDataSource, familyId: string | undefined, weekStart: PlainDate): Promise<void> {
    const request = ++this.requestId;
    if (familyId !== this.selectionFamily) {
      this.selectedChild.set(null);
      this.data.set(null);
      this.selectionFamily = familyId;
    }
    this.state.set('loading');
    try {
      const data = familyId ? await source.load(familyId, weekStart) : null;
      if (request !== this.requestId) {
        return; // A newer week was requested meanwhile.
      }
      if (!data?.children.some((c) => c.id === this.selectedChild())) {
        this.selectedChild.set(null);
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
