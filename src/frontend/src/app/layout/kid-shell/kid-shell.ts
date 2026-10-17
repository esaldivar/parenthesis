import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Logo } from '../../shared/brand/logo';
import { Icon } from '../../shared/icon/icon';
import { focusMainOnNavigation } from '../focus-main-on-navigation';
import { KID_NAV } from '../navigation';
import { KidPresentationService } from './kid-presentation.service';

/** The children's space: only child-appropriate destinations, no adult content. */
@Component({
  selector: 'app-kid-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo],
  host: { '[attr.data-presentation]': 'presentation.presentation()' },
  template: `
    <a class="skip-link" href="#kid-main">Skip to main content</a>
    <header class="kid-header">
      <a class="brand" routerLink="/kid" aria-label="My space home">
        <app-logo variant="mark" [markSize]="32" [decorative]="true" />
        <span>My space</span>
      </a>
      <a class="settings-link" routerLink="/kid/settings" routerLinkActive="is-active" ariaCurrentWhenActive="page">
        Settings
      </a>
    </header>

    <main id="kid-main" #main tabindex="-1">
      <router-outlet />
    </main>

    <nav class="kid-nav" aria-label="My space">
      <ul>
        @for (item of nav; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.path === '/kid' }"
              ariaCurrentWhenActive="page"
            >
              <app-icon [name]="item.icon" [size]="28" />
              <span>{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './kid-shell.scss',
})
export class KidShell {
  // Home is the "My space" link in the header, which leaves room for the labels at 320px.
  protected readonly nav = KID_NAV.filter((item) => item.path !== '/kid');
  protected readonly presentation = inject(KidPresentationService);
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  constructor() {
    focusMainOnNavigation(() => this.main());
  }
}
