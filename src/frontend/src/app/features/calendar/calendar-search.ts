import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Api, CalendarEvent, CalendarSearch as SearchCriteria, Child, FamilyMember } from '../../core/api/api';
import { Icon } from '../../shared/icon/icon';
import { dateMedium, dayOfMonth, dayLong, timeLabel, todayIn } from '../dashboard/week';
import { CalendarItem, toItems } from './calendar-items';
import { statusText } from './item-text';
import { toSearch } from './search-query';

/** Results per group and per "Show more". */
export const SEARCH_PAGE = 10;
/** Wait this long after typing stops before searching. */
export const SEARCH_DEBOUNCE_MS = 250;
/** How often "today" is checked, so the date on the button changes at midnight in the family's time zone. */
const CLOCK_TICK_MS = 60_000;

/** Space kept between the panel and the button, and below the panel. */
const PANEL_GAP = 24;
/** The panel is at least this tall, even when the button is near the bottom of the screen. */
const MIN_PANEL_HEIGHT = 240;

interface Group {
  readonly items: readonly CalendarItem[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
}

const EMPTY: Group = { items: [], hasMore: false, loadingMore: false };

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
];

/** "Mon, Oct 12, 2026 · 5:00 PM – 6:00 PM", "Oct 12 – Oct 14, 2026" or "Oct 12, 2026 · All day". */
export function resultWhen(item: CalendarItem): string {
  if (item.lastDate > item.firstDate) {
    const span = `${dateMedium(item.firstDate)} – ${dateMedium(item.lastDate)}`;
    return item.allDay ? span : `${span} · ${timeLabel(item.start.slice(11))} – ${timeLabel(item.end.slice(11))}`;
  }
  const day = dateMedium(item.firstDate);
  return item.allDay ? `${day} · All day` : `${day} · ${timeLabel(item.start.slice(11))} – ${timeLabel(item.end.slice(11))}`;
}

/** "Parenting time · Sam": the event type, with whose time it is when that's part of it. */
export function resultType(item: CalendarItem): string {
  return item.kind === 'parenting' && item.parents[0] ? `${item.categoryLabel} · ${item.parents[0].name}` : item.categoryLabel;
}

/**
 * Event search for the calendar toolbar (#253): a pill beside Today with a magnifier and today's date. It opens a field
 * that searches titles, event types and dates across the whole calendar on the server (never by downloading it).
 * Upcoming and ongoing events come first; past ones follow under "Past events". Choosing a result opens its existing
 * details. Plain matching only: no AI.
 */
@Component({
  selector: 'app-calendar-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon, NgTemplateOutlet],
  templateUrl: './calendar-search.html',
  styleUrl: './calendar-search.scss',
})
export class CalendarSearch {
  private readonly api = inject(Api);

  readonly familyId = input.required<string>();
  readonly timeZone = input.required<string>();
  readonly members = input.required<readonly FamilyMember[]>();
  readonly children = input.required<readonly Child[]>();
  /** A result was chosen: the page opens its details. */
  readonly picked = output<CalendarItem>();

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly positions = POSITIONS;
  private readonly now = signal(new Date());
  protected readonly today = computed(() => todayIn(this.timeZone(), this.now()));
  protected readonly todayDay = computed(() => dayOfMonth(this.today()));
  protected readonly todayLabel = computed(() => `Search events. Today is ${dayLong(this.today())}`);

  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly state = signal<'idle' | 'loading' | 'error' | 'ready'>('idle');
  protected readonly upcoming = signal<Group>(EMPTY);
  protected readonly past = signal<Group>(EMPTY);
  private criteria: SearchCriteria | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private token = 0;

  protected readonly total = computed(() => this.upcoming().items.length + this.past().items.length);
  protected readonly status = computed(() => {
    switch (this.state()) {
      case 'loading':
        return 'Searching…';
      case 'error':
        return 'We couldn’t search the calendar.';
      case 'ready': {
        const [u, p] = [this.upcoming(), this.past()];
        if (this.total() === 0) return 'No events match.';
        const more = u.hasMore || p.hasMore ? ' or more' : '';
        return `${u.items.length} upcoming and ${p.items.length} past events${more} found.`;
      }
      default:
        return 'Search by title, event type or date, such as “soccer”, “parenting time” or “Oct 12”.';
    }
  });

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearTimeout(this.timer);
    });
  }

  protected show(): void {
    // Sized before it opens, so the overlay can place it below the button.
    this.maxHeight.set(this.spaceBelow());
    this.open.set(true);
  }

  /** The space below the button, above the phone layout's bottom navigation when it shows. */
  private spaceBelow(): number | null {
    const nav = document.querySelector('nav.bottomnav')?.getBoundingClientRect();
    const floor = nav && nav.height > 0 ? Math.min(nav.top, window.innerHeight) : window.innerHeight;
    const below = floor - this.trigger().nativeElement.getBoundingClientRect().bottom - PANEL_GAP;
    return below > 0 ? Math.max(MIN_PANEL_HEIGHT, below) : null;
  }

  /** The panel's height cap: the space below the button, so long results scroll inside it, never off screen. */
  protected readonly maxHeight = signal<number | null>(null);

  /** Focus the field once the panel is attached. */
  protected attached(): void {
    queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  /** Escape, a click outside or the panel detaching: close, and put focus back on the button when it was inside. */
  protected close(returnFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  protected outsideClick(event: MouseEvent): void {
    // A click on the button itself toggles it there.
    if (!this.trigger().nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected typed(value: string): void {
    this.text.set(value);
    clearTimeout(this.timer);
    const token = ++this.token;
    const criteria = toSearch(value, this.members(), this.today());
    this.criteria = criteria;
    if (!criteria) {
      this.state.set('idle');
      this.upcoming.set(EMPTY);
      this.past.set(EMPTY);
      return;
    }
    this.state.set('loading');
    this.timer = setTimeout(() => void this.search(token, criteria), SEARCH_DEBOUNCE_MS);
  }

  protected retry(): void {
    if (this.criteria) {
      const token = ++this.token;
      this.state.set('loading');
      void this.search(token, this.criteria);
    }
  }

  private async search(token: number, criteria: SearchCriteria): Promise<void> {
    const familyId = this.familyId();
    try {
      const [upcoming, past] = await Promise.all([
        this.api.searchCalendarEvents(familyId, criteria, { past: false, offset: 0, limit: SEARCH_PAGE }),
        this.api.searchCalendarEvents(familyId, criteria, { past: true, offset: 0, limit: SEARCH_PAGE }),
      ]);
      if (token !== this.token) return;
      this.upcoming.set({ items: this.items(upcoming.events), hasMore: upcoming.hasMore, loadingMore: false });
      this.past.set({ items: this.items(past.events), hasMore: past.hasMore, loadingMore: false });
      this.state.set('ready');
    } catch {
      if (token === this.token) this.state.set('error');
    }
  }

  protected async more(past: boolean): Promise<void> {
    const group = past ? this.past : this.upcoming;
    const criteria = this.criteria;
    const token = this.token;
    if (!criteria || group().loadingMore) return;
    group.update((g) => ({ ...g, loadingMore: true }));
    try {
      const page = await this.api.searchCalendarEvents(this.familyId(), criteria, {
        past,
        offset: group().items.length,
        limit: SEARCH_PAGE,
      });
      if (token !== this.token) return;
      const seen = new Set(group().items.map((i) => i.id));
      group.update((g) => ({
        items: [...g.items, ...this.items(page.events).filter((i) => !seen.has(i.id))],
        hasMore: page.hasMore,
        loadingMore: false,
      }));
    } catch {
      if (token === this.token) {
        group.update((g) => ({ ...g, loadingMore: false }));
        this.state.set('error');
      }
    }
  }

  protected choose(item: CalendarItem): void {
    this.close();
    this.picked.emit(item);
  }

  protected readonly when = resultWhen;
  protected readonly type = resultType;
  protected readonly statusOf = statusText;

  /** Arrow keys move between the field, the results and "Show more"; Escape closes. */
  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const stops = [
      this.field()?.nativeElement,
      ...(this.panel()?.nativeElement.querySelectorAll<HTMLElement>('[data-stop]') ?? []),
    ].filter((e): e is HTMLElement => !!e);
    const at = stops.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? Math.min(at + 1, stops.length - 1) : Math.max(at - 1, 0);
    stops[next].focus();
  }

  private items(events: readonly CalendarEvent[]): CalendarItem[] {
    return toItems(events, this.members(), this.children(), this.timeZone());
  }
}
