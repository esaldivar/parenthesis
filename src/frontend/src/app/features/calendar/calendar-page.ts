import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarEvent, Child, FamilyMember, Reminder, SharedTask } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon } from '../../shared/icon/icon';
import { PlainDate } from '../dashboard/model';
import { addDays, startOfWeek, todayIn, weekLabelLong } from '../dashboard/week';
import { CalendarFilterPanel } from './calendar-filter-panel';
import {
  ALL_FILTERS,
  CalendarFilters,
  DIMENSIONS,
  Dimension,
  activeDimensions,
  applyFilters,
  concealedUnavailable,
  filtersKey,
  filtersToSave,
  parseFilters,
  selectionText,
} from './calendar-filters';
import { CalendarItem, forChild, reminderItems, swapTargetFor, taskItems, toItems } from './calendar-items';
import { CalendarList } from './calendar-list';
import { CalendarMonth, monthGrid, startOfMonth } from './calendar-month';
import { CalendarWeek } from './calendar-week';
import { EventDetails } from './event-details';
import { AddAt, addQuery } from './slot';
import { ReminderDetails } from './reminder-details';
import { TaskDetails } from './task-details';
import { fromFamilyLocal } from './time';

export type CalendarView = 'week' | 'month' | 'list';
type LoadState = 'loading' | 'error' | 'ready';

const VIEWS: readonly { id: CalendarView; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'list', label: 'List' },
];

const isDate = (value: string | undefined): value is PlainDate => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** "October 2026" */
function monthLabel(date: PlainDate): string {
  const [y, m] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The first day of the next month. */
const nextMonth = (date: PlainDate): PlainDate => {
  const [y, m] = date.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
const previousMonth = (date: PlainDate): PlainDate => startOfMonth(addDays(startOfMonth(date), -1));

/**
 * The shared calendar (M3; docs/design/handoffs/2026-10-20-calendar.md). Week is the default, with Month and List;
 * a child filter; and calm loading, error and empty states. The view, date and child live in the address, so the
 * dashboard can open it on the week it was showing. Pending items are labelled and patterned, never shown as
 * confirmed; selecting any item opens its details.
 */
@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    RouterLink,
    EmptyState,
    Icon,
    CalendarWeek,
    CalendarMonth,
    CalendarList,
    EventDetails,
    ReminderDetails,
    TaskDetails,
    CalendarFilterPanel,
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export class CalendarPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** `?view=week|month|list` */
  readonly view = input<string>();
  /** `?date=YYYY-MM-DD`, any day in the period. */
  readonly date = input<string>();
  /** `?week=YYYY-MM-DD`, from the dashboard; same as `date`. */
  readonly week = input<string>();
  /** `?child=<id>` */
  readonly child = input<string>();
  /** `?event=<id>`: open that event's details once it's loaded (e.g. "View request details" after a swap). */
  readonly event = input<string>();

  protected readonly views = VIEWS;
  protected readonly family = this.auth.currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');
  protected readonly today = computed(() => todayIn(this.timeZone(), new Date()));

  protected readonly current = computed<CalendarView>(() =>
    (['week', 'month', 'list'] as const).find((v) => v === this.view()) ?? 'week',
  );
  protected readonly anchor = computed<PlainDate>(() => {
    const date = this.date();
    const week = this.week();
    return isDate(date) ? date : isDate(week) ? week : this.today();
  });

  /** [from, to) for the current view. Month fetches its whole six-week grid. */
  protected readonly range = computed(() => {
    const anchor = this.anchor();
    switch (this.current()) {
      case 'week': {
        const from = startOfWeek(anchor);
        return { from, to: addDays(from, 7) };
      }
      case 'month': {
        const grid = monthGrid(anchor);
        return { from: grid[0], to: addDays(grid[41], 1) };
      }
      default:
        return { from: startOfMonth(anchor), to: nextMonth(anchor) };
    }
  });

  protected readonly heading = computed(() =>
    this.current() === 'week' ? weekLabelLong(startOfWeek(this.anchor())) : monthLabel(this.anchor()),
  );
  protected readonly isCurrentPeriod = computed(() => {
    const { from, to } = this.range();
    const today = this.today();
    return this.current() === 'month' ? today.slice(0, 7) === this.anchor().slice(0, 7) : today >= from && today < to;
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  private readonly events = signal<readonly CalendarEvent[]>([]);
  private readonly reminders = signal<readonly Reminder[]>([]);
  private readonly tasks = signal<readonly SharedTask[]>([]);
  protected readonly members = signal<readonly FamilyMember[]>([]);
  protected readonly children = signal<readonly Child[]>([]);
  private readonly reloads = signal(0);
  /** A message after adding or cancelling, read out politely. */
  protected readonly notice = signal<string | null>(null);

  protected readonly items = computed(() => [
    ...toItems(this.events(), this.members(), this.children(), this.timeZone()),
    ...reminderItems(this.reminders(), this.members(), this.children(), this.timeZone()),
    ...taskItems(this.tasks(), this.members(), this.children()),
  ]);
  protected readonly childFilter = computed(() => {
    const child = this.child();
    return this.children().some((c) => c.id === child) ? child! : null;
  });
  /** This parent's own filters (#190): remembered in this browser per parent and family, never shared. */
  protected readonly filters = signal<CalendarFilters>(ALL_FILTERS);
  protected readonly filtersOpen = signal(false);
  protected readonly activeFilters = computed(() =>
    activeDimensions(this.filters()).map((id) => ({
      id,
      label: DIMENSIONS.find((d) => d.id === id)!.label,
      text: selectionText(this.filters(), id),
    })),
  );
  private readonly me = computed(() => this.members().find((m) => m.isYou)?.membershipId);
  protected readonly childShown = computed(() => forChild(this.items(), this.childFilter()));
  /** Items shown in full (not counting hidden-unavailable markers). */
  protected readonly visibleCount = computed(() => this.shown().filter((i) => !i.concealed).length);
  protected readonly shown = computed(() => [
    ...applyFilters(this.childShown(), this.filters(), this.me()),
    ...concealedUnavailable(this.childShown(), this.filters(), this.me()),
  ]);
  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));

  protected readonly selected = signal<CalendarItem | null>(null);
  protected readonly selectedEvent = computed(() => this.events().find((e) => e.id === this.selected()?.id) ?? null);
  protected readonly selectedReminder = computed(() => {
    const item = this.selected();
    return item?.reminderId ? (this.reminders().find((r) => `reminder:${r.id}:${r.startsAt}` === item.id) ?? null) : null;
  });
  protected readonly selectedTask = computed(() => {
    const id = this.selected()?.taskId;
    return id ? (this.tasks().find((t) => t.id === id) ?? null) : null;
  });
  /**
   * For unavailable time: the same parent's confirmed parenting time it overlaps, so the details can offer a swap only
   * when one applies (#190). Uses every loaded item, whatever the filters hide.
   */
  protected readonly swapTarget = computed(() => swapTargetFor(this.selected(), this.items()));
  private opener: HTMLElement | null = null;
  private readonly storage = inject(DOCUMENT).defaultView;
  private readonly user = this.auth.user;
  /** Where this parent's filters are kept for this family, once both are known. */
  private readonly storageKey = computed(() => {
    const user = this.user();
    const family = this.family();
    return user && family ? filtersKey(user.id, family.id) : null;
  });

  constructor() {
    // A message handed over by the Add Event page.
    const handed = this.router.currentNavigation()?.extras.state?.['calendarNotice'];
    if (typeof handed === 'string') {
      this.notice.set(handed);
    }

    effect(() => {
      const family = this.family();
      const { from, to } = this.range();
      this.reloads();
      if (!family) {
        return;
      }
      untracked(() => void this.load(family.id, from, to));
    });

    // Restore this parent's filters for this family. Storage can be missing or blocked; then everything shows.
    effect(() => {
      const key = this.storageKey();
      untracked(() => this.filters.set(key ? parseFilters(this.read(key)) : ALL_FILTERS));
    });

    effect(() => {
      const id = this.event();
      const item = this.state() === 'ready' ? this.items().find((i) => i.id === id) : undefined;
      if (item && id !== this.linked) {
        this.linked = id;
        untracked(() => this.selected.set(item));
      }
    });
  }

  /** The `?event=` already opened, so closing it doesn't reopen it. */
  private linked: string | undefined;

  private loadToken = 0;

  private async load(familyId: string, from: PlainDate, to: PlainDate): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    try {
      const zone = this.timeZone();
      const needsFamily = this.members().length === 0;
      const [fromInstant, toInstant] = [fromFamilyLocal(`${from}T00:00`, zone), fromFamilyLocal(`${to}T00:00`, zone)];
      const [events, reminders, tasks, details, children] = await Promise.all([
        this.api.calendarEvents(familyId, fromInstant, toInstant),
        this.api.reminders(familyId, fromInstant, toInstant),
        this.api.tasks(familyId, from, to),
        needsFamily ? this.api.family(familyId) : Promise.resolve(null),
        needsFamily ? this.api.children(familyId) : Promise.resolve(null),
      ]);
      if (token !== this.loadToken) {
        return;
      }
      if (details) {
        this.members.set(details.members);
      }
      if (children) {
        this.children.set(children);
      }
      this.events.set(events);
      this.reminders.set(reminders);
      this.tasks.set(tasks);
      this.state.set('ready');
      const open = this.selected();
      if (open && !this.items().some((i) => i.id === open.id)) {
        this.selected.set(null);
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.loadError.set(generalMessage(toProblem(error)));
        this.state.set('error');
      }
    }
  }

  protected retry(): void {
    this.reloads.update((n) => n + 1);
  }

  protected setView(view: CalendarView): void {
    this.navigate({ view });
  }

  protected step(direction: -1 | 1): void {
    const anchor = this.anchor();
    const date =
      this.current() === 'week'
        ? addDays(anchor, direction * 7)
        : direction === 1
          ? nextMonth(anchor)
          : previousMonth(anchor);
    this.navigate({ date });
  }

  protected goToToday(): void {
    this.navigate({ date: this.today() });
  }

  protected setChild(childId: string | null): void {
    this.navigate({ child: childId });
  }

  /** From Month: open the week of that day. */
  protected openWeekOf(date: PlainDate): void {
    this.navigate({ view: 'week', date });
  }

  /** A tap on empty calendar space (#212): the Add page, starting on that date (and half-hour). Nothing is saved yet. */
  protected addAt(at: AddAt): void {
    void this.router.navigate(['/calendar/new'], { queryParams: addQuery(at) });
  }

  protected open(item: CalendarItem): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.selected.set(item);
  }

  protected close(): void {
    this.selected.set(null);
    const opener = this.opener;
    afterNextRender(() => opener?.focus(), { injector: this.injector });
  }

  /** A task changed in its details (a tick, Mark done): show the new state and keep the details open. */
  protected taskUpdated(task: SharedTask): void {
    this.tasks.update((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
  }

  protected setFilters(filters: CalendarFilters): void {
    this.filters.set(filters);
    const key = this.storageKey();
    if (key) {
      try {
        this.storage?.localStorage.setItem(key, filtersToSave(filters));
      } catch {
        // Not remembered this time; the filters still apply now.
      }
    }
  }

  /** Reset filters: everything shows again, Unavailable included, and the saved choice is cleared. */
  protected resetFilters(): void {
    this.filters.set(ALL_FILTERS);
    const key = this.storageKey();
    if (key) {
      try {
        this.storage?.localStorage.removeItem(key);
      } catch {
        // Nothing saved to clear.
      }
    }
  }

  /** Remove one dimension's filter (a chip's ×). */
  protected clearFilter(dimension: Dimension): void {
    this.setFilters({ ...this.filters(), [dimension]: ALL_FILTERS[dimension] });
  }

  protected openFilters(): void {
    this.filtersOpen.set(true);
  }

  protected closeFilters(): void {
    this.filtersOpen.set(false);
    afterNextRender(() => document.querySelector<HTMLElement>('.filters-button')?.focus(), { injector: this.injector });
  }

  private read(key: string): string | null {
    try {
      return this.storage?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  /** After a cancellation (or a cancellation request) from the details panel. */
  protected changed(message: string): void {
    this.notice.set(message);
    this.selected.set(null);
    this.retry();
  }

  private navigate(params: { view?: CalendarView; date?: PlainDate; child?: string | null }): void {
    void this.router.navigate([], {
      queryParams: {
        view: params.view ?? (this.current() === 'week' ? null : this.current()),
        date: params.date ?? this.date() ?? this.week() ?? null,
        week: null,
        child: params.child === undefined ? (this.childFilter() ?? null) : params.child,
        event: null,
      },
      replaceUrl: true,
    });
  }
}
