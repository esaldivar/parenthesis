import { AppLocale, LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Avatar } from '../../shared/avatar/avatar';
import { Icon } from '../../shared/icon/icon';
import { monthDay, timeLabel } from '../dashboard/week';
import { CalendarItem } from './calendar-items';

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
      return item.pendingChange === 'Cancel' ? (locale === 'es-419' ? 'Cancelación pendiente' : 'Cancellation pending') : translate('calendar.filter.change-pending', locale);
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

/** The visible content of an item button: icon, title, time, people and status. */
@Component({
  selector: 'app-item-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Avatar, Icon],
  template: `
    <span class="visually-hidden">{{ summary() }}</span>
    <span class="row" aria-hidden="true">
      <app-icon class="icon" [name]="item().icon" [size]="18" />
      <span class="title" [class.title--declined]="item().status === 'declined'">{{
        item().concealed ? ('feature.hidden.unavailable' | tr) : item().title
      }}</span>
    </span>
    @if (!compact()) {
      <span class="when" aria-hidden="true">{{ when() }}</span>
      @if (avatars()) {
        <span class="people" aria-hidden="true">
          @for (parent of item().parents; track parent.id) {
            <app-avatar [name]="parent.name" kind="parent" [size]="22" [personId]="parent.id" photoOn="desktop" />
          }
          @for (child of item().children; track child.id) {
            <app-avatar [name]="child.name" [size]="22" [personId]="child.id" photoOn="desktop" />
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

  protected readonly when = computed(() => whenText(this.item(), this.locale.locale()));
  protected readonly status = computed(() => statusText(this.item(), this.locale.locale()));
  protected readonly summary = computed(() => itemSummary(this.item(), this.locale.locale()));
}
