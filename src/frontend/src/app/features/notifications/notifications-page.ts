import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, NotificationItem } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { NotificationsStore } from '../../core/notifications/notifications.store';

@Component({
  selector: 'app-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <section aria-labelledby="notifications-title">
      <h1 id="notifications-title">Notifications</h1>
      <p>Updates from your family.</p>

      @if (items().length) {
        <ol role="list">
          @for (item of items(); track item.id) {
            <li [class.cancelled]="item.kind === 'Cancelled'">
              <span class="icon" aria-hidden="true">{{ icons[item.kind] }}</span>
              <div>
                <strong>{{ labels[item.kind] }}</strong>
                <time [attr.datetime]="item.createdAt">{{ item.createdAt | date: 'medium' }}</time>
                @if (item.eventId) {
                  <a routerLink="/calendar" [queryParams]="{ date: item.eventDate, event: item.eventId }">View calendar event</a>
                }
              </div>
            </li>
          }
        </ol>
      } @else if (!loading() && !error()) {
        <p class="panel">You’re all caught up. New family updates will appear here.</p>
      }

      @if (loading()) {
        <p role="status">Loading notifications…</p>
      }
      @if (error()) {
        <p role="alert">We couldn’t load notifications. Please try again.</p>
        <button type="button" (click)="load(items().length > 0)">Try again</button>
      } @else if (hasMore() && !loading()) {
        <button type="button" (click)="load(true)">Load older notifications</button>
      }
    </section>
  `,
  styles: `
    section { max-width: 45rem; margin-inline: auto; padding: var(--space-4); }
    h1 { margin-block: 0 var(--space-2); }
    p, time { color: var(--color-text-secondary); }
    ol { display: grid; gap: var(--space-3); padding: 0; list-style: none; }
    li, .panel {
      display: flex;
      gap: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      padding: var(--space-4);
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--color-status-confirmed-bg);
      color: var(--color-text);
      font-weight: bold;
    }
    .cancelled .icon { background: var(--color-status-rejected-bg); }
    time, a { display: block; }
    a, button { color: var(--color-action); min-height: var(--target-min); }
    a { display: inline-flex; align-items: center; }
    button {
      background: var(--color-surface);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding-inline: var(--space-3);
      font: inherit;
    }
  `,
})
export class NotificationsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly store = inject(NotificationsStore);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private offset = 0;
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly icons = { Added: '+', Updated: '↻', Cancelled: '×' };
  protected readonly labels = {
    Added: 'Shared calendar event added',
    Updated: 'Shared calendar event updated',
    Cancelled: 'Shared calendar event cancelled',
  };

  constructor() {
    void this.load(false);
  }

  protected async load(older: boolean): Promise<void> {
    const family = this.auth.currentFamily();
    const parent = this.auth.user()?.id;
    if (family?.role !== 'Parent' || this.loading()) return;

    const current = () => !this.destroy.destroyed && family.id === this.auth.currentFamily()?.id
      && parent === this.auth.user()?.id;
    this.loading.set(true);
    this.error.set(false);
    try {
      const page = await this.api.notifications(family.id, older ? this.offset : 0);
      if (!current()) return;

      const previous = older ? this.items() : [];
      const known = new Set(previous.map(item => item.id));
      this.items.set([...previous, ...page.items.filter(item => !known.has(item.id))]);
      this.offset = (older ? this.offset : 0) + page.items.length;
      this.hasMore.set(page.hasMore);
      const ids = page.items.filter(item => !item.seen).map(item => item.id);
      if (ids.length) {
        afterNextRender(() => {
          if (current()) {
            void this.api.markNotificationsSeen(family.id, ids)
              .then(() => this.store.refresh()).catch(() => undefined);
          }
        }, { injector: this.injector });
      }
    } catch {
      if (current()) this.error.set(true);
    } finally {
      if (current()) this.loading.set(false);
    }
  }
}
