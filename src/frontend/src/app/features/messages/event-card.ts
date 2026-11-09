import { TranslatePipe } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarEvent, ChatEventCard } from '../../core/api/api';
import { toFamilyLocal } from '../calendar/time';
import { dateTimeLabel, datePart } from '../dashboard/week';
import { Icon } from '../../shared/icon/icon';

/** A calendar event as a chat card, from a calendar search result. */
export function toCard(event: CalendarEvent): ChatEventCard {
  return {
    id: event.id,
    available: true,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    status: event.status === 'PendingApproval' ? 'Proposed' : event.status === 'Rejected' ? 'Declined' : 'Confirmed',
    changePending: event.status === 'Confirmed' && event.pendingChange !== 'None',
  };
}

/** "Sat, Nov 7, 10:30 AM", or "Sat, Nov 7 · All day", in the family's time zone. */
export function cardWhen(card: ChatEventCard, timeZone: string): string {
  if (!card.startsAt) {
    return '';
  }
  const local = toFamilyLocal(card.startsAt, timeZone);
  const label = dateTimeLabel(local);
  return card.allDay ? `${label.slice(0, label.lastIndexOf(','))} · All day` : label;
}

/** A proposal or a declined request never reads as confirmed (CLAUDE.md product guardrails). */
export function cardStatus(card: ChatEventCard): string | null {
  switch (card.status) {
    case 'Proposed':
      return 'Pending approval';
    case 'Declined':
      return 'Declined';
    default:
      return card.changePending ? 'Change pending' : null;
  }
}

/**
 * A shared event (#125, slice 2 of docs/design/m4-chat.md): title, date and time, and its status when it isn't simply
 * confirmed. In a message it opens the event on the Calendar, where the Calendar's own permissions apply. An event the
 * parent's calendar no longer shows says so, and gives nothing else away.
 */
@Component({
  selector: 'app-chat-event-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, Icon],
  template: `
    @if (card().available) {
      @if (link()) {
        <a class="card" routerLink="/calendar" [queryParams]="query()">
          <app-icon name="calendar" [size]="24" />
          <span class="text">
            <span class="visually-hidden">{{ 'feature.open.in.calendar' | tr }} </span>
            <span class="title">{{ card().title }}<span class="visually-hidden">, </span></span>
            <span class="when">{{ when() }}</span>
            @if (status(); as s) {
              <span class="status"><span class="visually-hidden">, </span>{{ s }}</span>
            }
          </span>
          <app-icon name="chevron-right" [size]="22" />
        </a>
      } @else {
        <span class="card">
          <app-icon name="calendar" [size]="24" />
          <span class="text">
            <span class="title">{{ card().title }}<span class="visually-hidden">, </span></span>
            <span class="when">{{ when() }}</span>
            @if (status(); as s) {
              <span class="status"><span class="visually-hidden">, </span>{{ s }}</span>
            }
          </span>
        </span>
      }
    } @else {
      <span class="card card--gone">
        <app-icon name="calendar" [size]="24" />
        <span class="text">{{ 'feature.this.event.isn.t.on.your.calendar' | tr }}</span>
      </span>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
    .card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: var(--target-min);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-outline);
      text-decoration: none;
      text-align: start;
      overflow-wrap: anywhere;
    }
    a.card:hover {
      background: var(--color-surface-soft);
    }
    a.card:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    app-icon {
      flex: none;
      color: var(--color-action);
    }
    .text {
      display: grid;
      min-width: 0;
      flex: 1;
    }
    .title {
      font-weight: 700;
    }
    .when {
      font-size: 0.9375rem;
    }
    .status {
      justify-self: start;
      margin-top: var(--space-1);
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--color-status-pending-bg);
      color: var(--color-text);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .card--gone {
      color: var(--color-text-secondary);
      font-style: italic;
    }
    .card--gone app-icon {
      color: var(--color-text-secondary);
    }
  `,
})
export class ChatEventCardView {
  readonly card = input.required<ChatEventCard>();
  readonly timeZone = input.required<string>();
  /** In a message, the card opens the event on the Calendar. */
  readonly link = input(true);

  protected readonly when = computed(() => cardWhen(this.card(), this.timeZone()));
  protected readonly status = computed(() => cardStatus(this.card()));
  protected readonly query = computed(() => {
    const start = this.card().startsAt;
    return { date: start ? datePart(toFamilyLocal(start, this.timeZone())) : null, event: this.card().id };
  });
}
