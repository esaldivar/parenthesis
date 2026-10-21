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
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarEvent, Child, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon } from '../../shared/icon/icon';
import { PlainDate } from '../dashboard/model';
import { addDays, startOfWeek, todayIn, weekLabelLong } from '../dashboard/week';
import { CalendarItem, forChild, toItems } from './calendar-items';
import { CalendarList } from './calendar-list';
import { CalendarMonth, monthGrid, startOfMonth } from './calendar-month';
import { CalendarWeek } from './calendar-week';
import { EventDetails } from './event-details';
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
  imports: [MatButtonModule, RouterLink, EmptyState, Icon, CalendarWeek, CalendarMonth, CalendarList, EventDetails],
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
  protected readonly members = signal<readonly FamilyMember[]>([]);
  protected readonly children = signal<readonly Child[]>([]);
  private readonly reloads = signal(0);
  /** A message after adding or cancelling, read out politely. */
  protected readonly notice = signal<string | null>(null);

  protected readonly items = computed(() => toItems(this.events(), this.members(), this.children(), this.timeZone()));
  protected readonly childFilter = computed(() => {
    const child = this.child();
    return this.children().some((c) => c.id === child) ? child! : null;
  });
  protected readonly shown = computed(() => forChild(this.items(), this.childFilter()));
  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));

  protected readonly selected = signal<CalendarItem | null>(null);
  protected readonly selectedEvent = computed(() => this.events().find((e) => e.id === this.selected()?.id) ?? null);
  private opener: HTMLElement | null = null;

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
  }

  private loadToken = 0;

  private async load(familyId: string, from: PlainDate, to: PlainDate): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    try {
      const zone = this.timeZone();
      const needsFamily = this.members().length === 0;
      const [events, details, children] = await Promise.all([
        this.api.calendarEvents(familyId, fromFamilyLocal(`${from}T00:00`, zone), fromFamilyLocal(`${to}T00:00`, zone)),
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
      this.state.set('ready');
      const open = this.selected();
      if (open && !events.some((e) => e.id === open.id)) {
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

  protected open(item: CalendarItem): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.selected.set(item);
  }

  protected close(): void {
    this.selected.set(null);
    const opener = this.opener;
    afterNextRender(() => opener?.focus(), { injector: this.injector });
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
      },
      replaceUrl: true,
    });
  }
}
