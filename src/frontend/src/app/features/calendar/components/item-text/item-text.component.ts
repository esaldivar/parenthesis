import { AppLocale, LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { Avatar } from '../../../../shared/avatar/avatar';
import { Icon } from '../../../../shared/icon/icon';
import { monthDay, timeLabel } from '../../../../core/dates/dates';
import { CalendarItem } from '../../calendar-items';

/** "All day", "8:00 AM – 3:00 PM", or "Oct 20 – Oct 22" for an item over several dates. */
export function whenText(item: CalendarItem, locale: AppLocale = 'en'): string {
  const formatLocale = locale === 'en' ? 'en-US' : locale;
  if (item.lastDate > item.firstDate) {
    const range = `${monthDay(item.firstDate, formatLocale)} – ${monthDay(item.lastDate, formatLocale)}`;
    return item.allDay ? range : `${monthDay(item.firstDate, formatLocale)}, ${timeLabel(item.start.slice(11), formatLocale)} – ${monthDay(item.lastDate, formatLocale)}, ${timeLabel(item.end.slice(11), formatLocale)}`;
  }
  if (item.kind === 'task') {
    return translate('feature.due', locale);
  }
  if (item.allDay) {
    return translate('feature.all.day', locale);
  }
  // A reminder is for a moment, not a span.
  return item.kind === 'reminder'
    ? timeLabel(item.start.slice(11), formatLocale)
    : `${timeLabel(item.start.slice(11), formatLocale)} – ${timeLabel(item.end.slice(11), formatLocale)}`;
}

/**
 * The status in words. Pending and declined items are not on the schedule; a pending change leaves the event as it is
 * for now.
 */
export function statusText(item: CalendarItem, locale: AppLocale = 'en'): string | null {
  if (item.kind === 'task') {
    return item.done ? translate('feature.done', locale) : null;
  }
  switch (item.status) {
    case 'pending':
      return translate('calendar.filter.pending', locale);
    case 'change-pending':
      return item.pendingChange === 'Cancel' ? translate('calendar.cancel.pending', locale) : translate('calendar.filter.change-pending', locale);
    case 'declined':
      return translate('calendar.filter.declined', locale);
    default:
      return null;
  }
}

/** Everything a screen reader needs from one item, in one sentence. */
export function itemSummary(item: CalendarItem, locale: AppLocale = 'en'): string {
  if (item.concealed) {
    // Who and when only: a private note never appears here.
    if (locale === 'es-419') return `Horario no disponible oculto, ${item.parents[0]?.name ?? item.ownerName}, ${whenText(item, locale)}. Abre sus detalles.`;
    return `Hidden unavailable time, ${item.parents[0]?.name ?? item.ownerName}, ${whenText(item)}. Opens its details.`;
  }
  const people = [...item.parents.map((p) => p.name), ...item.children.map((c) => c.name)].join(', ');
  return [
    item.title,
    item.kind === 'unavailable' ? null : item.categoryLabel,
    whenText(item, locale),
    people || null,
    statusText(item, locale) ?? (item.kind === 'task' ? null : translate('calendar.filter.confirmed', locale)),
    item.beforeCoParentJoined ? (locale === 'es-419' ? 'Confirmado antes de que se uniera el otro padre o madre' : 'Confirmed before your co-parent joined') : null,
  ]
    .filter(Boolean)
    .join(', ');
}

const WEEK_AVATAR_SIZE = 18;
const WEEK_AVATAR_GAP = 2;
const WEEK_OVERFLOW_WIDTH = 16;

/** The visible content of an item button: icon, title, time, people and status. */
@Component({
  selector: 'app-item-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Avatar, Icon],
  host: { '[class.week-slot]': 'weekSlot()' },
  template: `
    <span class="visually-hidden">{{ summary() }}</span>
    <span class="row" aria-hidden="true">
      <app-icon class="icon" [name]="item().icon" [size]="18" />
      <span class="title" [class.title--declined]="item().status === 'declined'" [attr.title]="weekSlot() ? item().title : null">{{
        item().concealed ? ('feature.hidden.unavailable' | tr) : item().title
      }}</span>
    </span>
    @if (!compact()) {
      <span class="when" aria-hidden="true" [attr.title]="weekSlot() ? when() : null">
        <span [class.when--full]="weekStartTime()">{{ when() }}</span>
        @if (weekStartTime(); as start) {
          <span class="when--start">{{ start }}</span>
        }
      </span>
      @if (weekSlot() && attendees().length) {
        <span #weekPeople class="week-people" aria-hidden="true">
          @for (person of visibleAttendees(); track person.kind + ':' + person.id) {
            <app-avatar [name]="person.name" [kind]="person.kind" [size]="weekAvatarSize" [personId]="person.id" />
          }
          @if (extraAttendees(); as count) {
            <span class="people-more" [attr.title]="'calendar.moreAttendees' | tr: { count }">+{{ count }}</span>
          }
        </span>
      }
      @if (avatars() && !peopleWidth()) {
        <span class="people" aria-hidden="true">
          @for (parent of item().parents; track parent.id) {
            <app-avatar [name]="parent.name" kind="parent" [size]="22" [personId]="parent.id" />
          }
          @for (child of item().children; track child.id) {
            <app-avatar [name]="child.name" [size]="22" [personId]="child.id" />
          }
        </span>
      }
    }
    @if (status(); as status) {
      <span class="status" aria-hidden="true" [attr.data-done]="item().done ? 'true' : null" [attr.data-status]="item().status">{{
        status
      }}</span>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      min-width: 0;
    }
    .icon {
      display: var(--week-item-details, inline-flex);
      flex: none;
    }
    .title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .when {
      display: var(--week-item-details, block);
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .people {
      display: var(--week-item-details, flex);
      gap: 2px;
      flex-wrap: wrap;
    }
    .status {
      justify-self: start;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0 var(--space-1);
      border-radius: var(--radius-pill);
      border: 1px dashed var(--color-outline);
      background: var(--color-surface);
      max-inline-size: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .week-people,
    .when--start {
      display: none;
    }

    @media (min-width: 1024px) {
      @container calendar-week (min-width: 720px) {
        :host(.week-slot) {
          container: week-item / inline-size;
          grid-template-columns: minmax(0, 1fr) fit-content(45%);
          gap: 1px 2px;
          line-height: 1.1;
        }
        :host(.week-slot) .row,
        :host(.week-slot) .when {
          grid-column: 1 / -1;
        }
        :host(.week-slot) .row {
          height: 14px;
          font-size: 0.75rem;
        }
        :host(.week-slot) .icon {
          scale: 0.78;
        }
        :host(.week-slot) .when {
          font-size: 0.6875rem;
          line-height: 1;
        }
        :host(.week-slot) .people {
          display: none;
        }
        .week-people {
          display: flex;
          grid-column: 1;
          grid-row: 3;
          align-items: center;
          min-inline-size: 0;
          gap: 2px;
          padding: 2px;
        }
        .people-more {
          display: inline-grid;
          place-items: center;
          flex: none;
          inline-size: 16px;
          max-inline-size: 100%;
          block-size: 18px;
          border-radius: var(--radius-pill);
          background: var(--color-surface);
          color: var(--color-text);
          font-size: 0.625rem;
          font-weight: 700;
        }
        :host(.week-slot) .status {
          grid-column: 2;
          grid-row: 3;
          align-self: center;
          min-inline-size: 0;
          max-inline-size: 100%;
          padding-inline: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 0.625rem;
        }
      }

      @container week-item (width < 115px) {
        .icon,
        .when--full {
          display: none;
        }
        .when--start {
          display: inline;
        }
      }

      @container week-item (width < 60px) {
        :host(.week-slot) .when {
          font-size: 0.625rem;
        }
      }
    }

    @container calendar-week (width < 720px) {
      :host(.week-slot) {
        container: week-item / inline-size;
        gap: 1px;
        line-height: 1.1;
      }
      :host(.week-slot) .week-people {
        display: flex;
        align-items: center;
        min-inline-size: 0;
        gap: 2px;
        padding-block: 2px;
        overflow: hidden;
      }
      :host(.week-slot) .people { display: none; }
      :host(.week-slot) .people-more {
        flex: none;
        font-size: 0.625rem;
        color: var(--color-text);
      }
      :host(.week-slot) .status {
        padding-inline: 1px;
        font-size: 0.5625rem;
      }
    }

    @container week-item (width < 36px) {
      .people-more { display: none; }
    }

    /* Declined (#199): struck through and labelled, so it never reads as a confirmed plan. */
    .title--declined {
      text-decoration: line-through;
    }
    .status[data-status='declined'] {
      border-style: solid;
      background: var(--color-status-rejected-bg);
    }
    /* A done task: solid, never the dashed look of something pending. */
    .status[data-done='true'] {
      border-style: solid;
      background: var(--color-status-confirmed-bg);
    }
  `,
})
export class ItemText {
  private readonly locale = inject(LocaleService);
  readonly item = input.required<CalendarItem>();
  /** Title only (and status), for small month cells. */
  readonly compact = input(false);
  readonly avatars = input(true);
  /** The full Week grid uses a single compact row measured to fit its slot. */
  readonly weekSlot = input(false);

  protected readonly weekAvatarSize = WEEK_AVATAR_SIZE;
  private readonly weekPeople = viewChild<ElementRef<HTMLElement>>('weekPeople');
  protected readonly peopleWidth = signal(0);

  protected readonly attendees = computed(() => [
    ...this.item().parents.map(person => ({ ...person, kind: 'parent' as const })),
    ...this.item().children.map(person => ({ ...person, kind: 'child' as const })),
  ]);

  protected readonly visibleAttendees = computed(() => {
    const people = this.attendees();
    const width = this.peopleWidth();
    const stride = WEEK_AVATAR_SIZE + WEEK_AVATAR_GAP;
    if (people.length * stride - WEEK_AVATAR_GAP <= width) return people;
    const count = Math.max(width >= WEEK_AVATAR_SIZE ? 1 : 0, Math.floor((width - WEEK_OVERFLOW_WIDTH) / stride));
    return people.slice(0, count);
  });
  protected readonly extraAttendees = computed(() => this.attendees().length - this.visibleAttendees().length);
  protected readonly weekStartTime = computed(() =>
    this.weekSlot() && !this.item().spansDays ? timeLabel(this.item().start.slice(11), this.locale.locale()).replace(/\s+/g, '') : null,
  );

  protected readonly when = computed(() => whenText(this.item(), this.locale.locale()));
  protected readonly status = computed(() => statusText(this.item(), this.locale.locale()));
  protected readonly summary = computed(() => itemSummary(this.item(), this.locale.locale()));

  constructor() {
    afterRenderEffect((onCleanup) => {
      const row = this.weekPeople()?.nativeElement;
      if (!row || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => this.peopleWidth.set(entry.contentRect.width));
      observer.observe(row);
      onCleanup(() => observer.disconnect());
    });
  }
}
