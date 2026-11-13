import { TranslatePipe } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EssentialsUpdatesStore } from '../../../../core/essentials/essentials-updates.store';
import { RouterLink } from '@angular/router';
import { SharedRecordsAttentionStore } from '../../../../core/shared-records/shared-records-attention.store';
import { Icon } from '../../../../shared/icon/icon';
import { PARENT_MORE_NAV } from '../../../../core/layout/navigation';

/** On phones: the destinations that don't fit in the bottom navigation. */
@Component({
  selector: 'app-more-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, TranslatePipe],
  template: `
    <h1>{{ 'nav.more' | tr }}</h1>
    <ul>
      @for (item of items; track item.path) {
        <li>
          <a [routerLink]="item.path">
            <app-icon [name]="item.icon" />
            <span>{{ item.labelKey | tr }}</span>
            @if (item.path === '/child-essentials' && essentials.newUpdates()) {
              <span class="dot" aria-hidden="true"></span>
              <span class="visually-hidden">, {{ 'nav.updated' | tr }}</span>
            }
            @if (item.path === '/shared-records' && records.needsYou()) {
              <span class="dot" aria-hidden="true"></span>
              <span class="visually-hidden">, {{ 'nav.waiting' | tr }}</span>
            }
            @if (item.note) {
              <span class="note"><span class="visually-hidden">, </span>{{ item.note }}</span>
            }
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      overflow: hidden;
    }
    li + li {
      border-top: 1px solid var(--color-divider);
    }
    a {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 56px;
      padding: var(--space-2) var(--space-4);
      color: var(--color-text);
      text-decoration: none;
    }
    .dot {
      width: 0.625rem;
      height: 0.625rem;
      margin-inline-start: auto;
      border-radius: 50%;
      background: var(--color-action);
    }
    .note {
      margin-inline-start: auto;
      padding: 0 var(--space-2);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-pill);
      font-size: 0.75rem;
    }
  `,
})
export class MorePage {
  protected readonly essentials = inject(EssentialsUpdatesStore);
  protected readonly records = inject(SharedRecordsAttentionStore);
  protected readonly items = PARENT_MORE_NAV;
}
