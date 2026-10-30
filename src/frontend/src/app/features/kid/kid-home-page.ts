import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KID_NAV } from '../../layout/navigation';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-kid-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <h1>Welcome to your space</h1>
    <p class="intro">A place for your drawings, your diary and your favourite memories.</p>
    <ul class="tiles">
      @for (item of tiles; track item.path) {
        <li>
          <a [routerLink]="item.path">
            <app-icon [name]="item.icon" [size]="40" />
            <span>{{ item.label }}</span>
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    .intro {
      color: var(--color-text-secondary);
      margin-bottom: var(--space-6);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      min-height: 8.5rem;
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      color: var(--color-text);
      font-weight: 600;
      text-align: center;
      text-decoration: none;
    }
    a:hover {
      border-color: var(--color-outline);
    }
    app-icon {
      color: var(--color-action);
    }
  `,
})
export class KidHomePage {
  protected readonly tiles = KID_NAV.filter((item) => item.path !== '/kid');
}
