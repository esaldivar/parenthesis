import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { NavItem, PARENT_MOBILE_NAV, PARENT_NAV } from '../../layout/navigation';

/** On phones: the destinations that don't fit in the bottom navigation. */
@Component({
  selector: 'app-more-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <h1>More</h1>
    <ul>
      @for (item of items; track item.path) {
        <li>
          <a [routerLink]="item.path">
            <app-icon [name]="item.icon" />
            <span>{{ item.label }}</span>
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
  private readonly inBottomNav = new Set(PARENT_MOBILE_NAV.map((item) => item.path));
  protected readonly items: NavItem[] = PARENT_NAV.filter((item) => !this.inBottomNav.has(item.path));
}
