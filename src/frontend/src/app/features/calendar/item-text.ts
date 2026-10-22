import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Avatar } from '../../shared/avatar/avatar';
import { Icon } from '../../shared/icon/icon';
import { monthDay, timeLabel } from '../dashboard/week';
import { CalendarItem } from './calendar-items';

/** "All day", "8:00 AM – 3:00 PM", or "Oct 20 – Oct 22" for an item over several dates. */
export function whenText(item: CalendarItem): string {
  if (item.lastDate > item.firstDate) {
    const range = `${monthDay(item.firstDate)} – ${monthDay(item.lastDate)}`;
    return item.allDay ? range : `${monthDay(item.firstDate)}, ${timeLabel(item.start.slice(11))} – ${monthDay(item.lastDate)}, ${timeLabel(item.end.slice(11))}`;
  }
  if (item.kind === 'task') {
    return 'Due';
  }
  if (item.allDay) {
    return 'All day';
  }
  // A reminder is for a moment, not a span.
  return item.kind === 'reminder'
    ? timeLabel(item.start.slice(11))
    : `${timeLabel(item.start.slice(11))} – ${timeLabel(item.end.slice(11))}`;
}

/**
 * The status in words. Pending and declined items are not on the schedule; a pending change leaves the event as it is
 * for now.
 */
export function statusText(item: CalendarItem): string | null {
  if (item.kind === 'task') {
    return item.done ? 'Done' : null;
  }
  switch (item.status) {
    case 'pending':
      return 'Pending approval';
    case 'change-pending':
      return item.pendingChange === 'Cancel' ? 'Cancellation pending' : 'Change pending';
    case 'declined':
      return 'Declined';
    default:
      return null;
  }
}

/** Everything a screen reader needs from one item, in one sentence. */
export function itemSummary(item: CalendarItem): string {
  if (item.concealed) {
    // Who and when only: a private note never appears here.
    return `Hidden unavailable time, ${item.parents[0]?.name ?? item.ownerName}, ${whenText(item)}. Opens its details.`;
  }
  const people = [...item.parents.map((p) => p.name), ...item.children.map((c) => c.name)].join(', ');
  return [
    item.title,
    item.kind === 'unavailable' ? null : item.categoryLabel,
    whenText(item),
    people || null,
    statusText(item) ?? (item.kind === 'task' ? null : 'Confirmed'),
    item.beforeCoParentJoined ? 'Confirmed before your co-parent joined' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The visible content of an item button: icon, title, time, people and status. */
@Component({
  selector: 'app-item-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon],
  template: `
    <span class="visually-hidden">{{ summary() }}</span>
    <span class="row" aria-hidden="true">
      <app-icon class="icon" [name]="item().icon" [size]="18" />
      <span class="title" [class.title--declined]="item().status === 'declined'">{{
        item().concealed ? 'Hidden: unavailable' : item().title
      }}</span>
    </span>
    @if (!compact()) {
      <span class="when" aria-hidden="true">{{ when() }}</span>
      @if (avatars()) {
        <span class="people" aria-hidden="true">
          @for (parent of item().parents; track parent.id) {
            <app-avatar [name]="parent.name" kind="parent" [size]="22" />
          }
          @for (child of item().children; track child.id) {
            <app-avatar [name]="child.name" [size]="22" />
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
      flex: none;
    }
    .title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .when {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .people {
      display: flex;
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
  readonly item = input.required<CalendarItem>();
  /** Title only (and status), for small month cells. */
  readonly compact = input(false);
  readonly avatars = input(true);

  protected readonly when = computed(() => whenText(this.item()));
  protected readonly status = computed(() => statusText(this.item()));
  protected readonly summary = computed(() => itemSummary(this.item()));
}
