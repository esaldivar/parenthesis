import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { AppLocale, LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { timeLabel } from '../../../../core/dates/dates';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { CalendarItem } from '../../calendar-items';
import { itemSummary, statusWord, whenText } from '../item-text/item-text.component';

/**
 * Where a card sits (#729, Quiet Planner): `list` has a time column; `agenda` (phone Week and Month) puts the time
 * in its second line; `week` is a timed block on the desktop grid; `span` is a bar in the all-day row; `row` is one
 * line of a same-time group on the desktop grid.
 */
export type CardLayout = 'list' | 'agenda' | 'week' | 'span' | 'row';

/** "All day", "Due", or the start time; an item over several dates says its dates. */
export function startText(item: CalendarItem, locale: AppLocale = 'en'): string {
  if (item.lastDate > item.firstDate || item.kind === 'task' || item.allDay) {
    return whenText(item, locale);
  }
  return timeLabel(item.start.slice(11), locale === 'en' ? 'en-US' : locale);
}

/** "Activity · Kai": the type, and the children for an activity, reminder or task. */
export function typeText(item: CalendarItem): string {
  const children = item.kind === 'activity' || item.kind === 'reminder' || item.kind === 'task' ? item.children.map((c) => c.name) : [];
  return [item.categoryLabel, ...(children.length ? [children.join(', ')] : [])].join(' · ');
}

/** The title as shown, saying whose unavailable time it is ("Sam · Unavailable"). */
export function displayTitle(item: CalendarItem, locale: AppLocale = 'en'): string {
  if (item.concealed) {
    return translate('feature.hidden.unavailable', locale);
  }
  const unavailable = translate('feature.unavailable', locale);
  return item.kind === 'unavailable' && item.title === unavailable && item.parents[0] ? `${item.parents[0].name} · ${item.title}` : item.title;
}

/** The status word shown before a card's title ("Proposed · Dinner"), or "Done" for a finished task. */
export function cardStatus(item: CalendarItem, locale: AppLocale = 'en'): string | null {
  return statusWord(item, locale) ?? (item.kind === 'task' && item.done ? translate('feature.done', locale) : null);
}

/** The palette a Quiet Planner card takes its tint and marker from (#729). */
export const cardPalette = (item: CalendarItem): string => (item.concealed ? 'concealed' : (item.palette ?? item.kind));
/** `--tint` and `--marker` for a Quiet Planner card's style (#729): its type's fill and its type's own colour. */
export const cardTint = (item: CalendarItem): Record<string, string> => {
  const key = cardPalette(item);
  return { '--tint': `var(--color-calendar-${key}-bg)`, '--marker': `var(--color-calendar-${key}-fg)` };
};

const AVATAR_SIZES: Record<CardLayout, number> = { list: 24, agenda: 26, week: 16, span: 22, row: 16 };
/** Photos a list or agenda card shows before "+N": enough for both parents and two children. */
const MAX_PEOPLE = 4;
const AVATAR_GAP = 2;
/** Room kept for "+N" when not everyone fits (#553). */
const MORE_WIDTH = 18;
/** Cards on the desktop grid fit their photos to the space they have, never clipping one (#553). */
const MEASURED: readonly CardLayout[] = ['week', 'span', 'row'];
/** A bar or a same-time row keeps this much for its title before showing photos, so the title stays readable (#729). */
const TITLE_ROOM = 96;
/** Narrower than this, a bar puts its photos on a second line under the title (#553). */
const STACK_BELOW = 160;

/**
 * One calendar item's visible content in the Quiet Planner views (#729). A screen reader hears the same single
 * sentence as everywhere else in the calendar; the visible text is hidden from it. People are their authorized
 * profile photos, or initials.
 */
@Component({
  selector: 'app-item-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, TranslatePipe],
  host: { '[attr.data-layout]': 'layout()' },
  template: `
    <span class="visually-hidden">{{ summary() }}</span>
    @if (layout() === 'list') {
      <span class="time" aria-hidden="true">{{ start() }}</span>
    }
    <span class="text" aria-hidden="true">
      <span class="line" [class.line--declined]="item().status === 'declined'">@if (status(); as status) {<span class="status">{{ status }} · </span>}@if (owner(); as owner) {<span class="owner">{{ owner }} · </span>}<span class="title" [class.title--declined]="item().status === 'declined'">{{ title() }}</span></span>
      @if (sub(); as sub) {
        <span class="sub">{{ sub }}</span>
      }
    </span>
    @if (people().length) {
      <span #peopleBox class="people" aria-hidden="true">
        @for (person of shownPeople(); track person.kind + ':' + person.id) {
          <app-avatar [name]="person.name" [kind]="person.kind" [size]="avatarSize()" [personId]="person.id" />
        }
        @if (extra(); as count) {
          <span class="more" [attr.title]="'calendar.moreAttendees' | tr: { count }">+{{ count }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 2px var(--space-2);
      min-inline-size: 0;
    }
    :host([data-layout='list']) {
      /* The title starts 120px into the card, as in the frames (15px padding, 93px time, 12px gap). */
      grid-template-columns: 5.8125rem minmax(0, 1fr) auto;
      gap: var(--space-3);
    }
    :host([data-layout='list']) .line {
      font-size: 0.9375rem;
    }
    :host([data-layout='agenda']) .line {
      font-size: 0.875rem;
    }
    :host([data-layout='list']) .sub,
    :host([data-layout='agenda']) .sub {
      font-size: 0.75rem;
    }
    .time {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      overflow-wrap: anywhere;
    }
    .text {
      display: grid;
      min-inline-size: 0;
    }
    /* The status word stays whole; the title takes the rest and ends with an ellipsis. */
    .line {
      display: flex;
      min-inline-size: 0;
      font-weight: 600;
      white-space: nowrap;
    }
    .status,
    .owner {
      flex: none;
      /* Keeps the space after "·" at the end of the flex item. */
      white-space: pre;
    }
    .title {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .people {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .more {
      font-size: 0.75rem;
      font-weight: 700;
    }
    /* Declined (#199): struck through and labelled, so it never reads as a confirmed plan. */
    .line--declined > span {
      text-decoration: line-through;
    }

    /* A timed block on the desktop Week grid: the title, then the start time with the people at its end. */
    :host([data-layout='week']) {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: 'title title' 'sub people';
      align-items: end;
      gap: 0 2px;
      line-height: 1.25;
    }
    :host([data-layout='week']) .text {
      display: contents;
    }
    :host([data-layout='week']) .line {
      grid-area: title;
      font-size: 0.75rem;
    }
    :host([data-layout='week']) .sub {
      grid-area: sub;
      font-size: 0.6875rem;
    }
    /* The time stays whole; photos give way from the end. */
    :host([data-layout='week']) .people {
      grid-area: people;
      justify-content: end;
      min-inline-size: 0;
    }
    :host([data-layout='span']) {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    :host([data-layout='span']) .people,
    :host([data-layout='row']) .people {
      justify-content: end;
      min-inline-size: 0;
    }
    /* A narrow bar keeps its title on one line and puts its photos under it (#553). */
    :host([data-layout='span']) {
      container-type: inline-size;
    }
    @container (width < 10rem) {
      :host([data-layout='span']) .people {
        grid-column: 1 / -1;
        justify-content: start;
      }
    }
    :host([data-layout='row']) {
      grid-template-columns: minmax(0, 1fr) auto;
      font-size: 0.75rem;
      line-height: 1.2;
    }
    :host([data-layout='span']) .line {
      font-weight: 500;
    }
    /* Narrow phones: the time column wraps over the title instead of squeezing it. */
    @container (width < 360px) {
      :host([data-layout='list']) {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      :host([data-layout='list']) .time {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class ItemCard {
  private readonly locale = inject(LocaleService);
  readonly item = input.required<CalendarItem>();
  readonly layout = input<CardLayout>('list');

  protected readonly summary = computed(() => itemSummary(this.item(), this.locale.locale()));
  protected readonly title = computed(() =>
    this.item().concealed ? translate('feature.hidden.unavailable', this.locale.locale()) : this.item().title,
  );
  /** Whose unavailable time it is, when its title says only "Unavailable" ("Sam · Unavailable"). */
  protected readonly owner = computed(() => {
    const item = this.item();
    return !item.concealed && displayTitle(item, this.locale.locale()) !== item.title ? item.parents[0]?.name ?? null : null;
  });
  protected readonly status = computed(() => (this.item().concealed ? null : cardStatus(this.item(), this.locale.locale())));
  protected readonly start = computed(() => startText(this.item(), this.locale.locale()));
  protected readonly sub = computed(() => {
    const item = this.item();
    if (item.concealed) return null;
    switch (this.layout()) {
      case 'list':
        return typeText(item);
      case 'agenda':
        return `${this.start()} · ${typeText(item)}`;
      case 'week':
        return item.spansDays ? null : this.start();
      default:
        return null;
    }
  });
  protected readonly avatarSize = computed(() => AVATAR_SIZES[this.layout()]);
  protected readonly people = computed(() =>
    this.item().concealed
      ? []
      : [
          ...this.item().parents.map((p) => ({ ...p, kind: 'parent' as const })),
          ...this.item().children.map((c) => ({ ...c, kind: 'child' as const })),
        ],
  );
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly peopleBox = viewChild<ElementRef<HTMLElement>>('peopleBox');
  /** The width the photos have on the desktop grid; 0 until measured. */
  private readonly peopleWidth = signal(0);
  protected readonly shownPeople = computed(() => {
    const people = this.people();
    if (!MEASURED.includes(this.layout())) return people.slice(0, MAX_PEOPLE);
    const width = this.peopleWidth();
    if (!width) return people;
    const stride = this.avatarSize() + AVATAR_GAP;
    if (people.length * stride - AVATAR_GAP <= width) return people;
    return people.slice(0, Math.max(0, Math.floor((width - MORE_WIDTH) / stride)));
  });
  protected readonly extra = computed(() => this.people().length - this.shownPeople().length);

  constructor() {
    afterRenderEffect((onCleanup) => {
      const layout = this.layout();
      // A timed block gives its photos their own column; a bar or row shares its line with the title, which comes first.
      const box = layout === 'week' ? this.peopleBox()?.nativeElement : (this.host.nativeElement as HTMLElement);
      if (!box || !MEASURED.includes(layout) || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) =>
        this.peopleWidth.set(
          layout === 'week' || (layout === 'span' && entry.contentRect.width < STACK_BELOW)
            ? entry.contentRect.width
            : Math.max(1, entry.contentRect.width - TITLE_ROOM),
        ),
      );
      observer.observe(box);
      onCleanup(() => observer.disconnect());
    });
  }
}
