import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Logo } from '../../shared/brand/logo';

/**
 * A calm, single-column frame for signing in, registering and setting up a family. Provisional layout from the
 * design system; it will follow approved mockups when they arrive (docs/design/PAGE_DESIGNS.md).
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo],
  template: `
    <a class="skip-link" href="#auth-main">Skip to main content</a>
    <header class="auth-header">
      <a [routerLink]="wide ? '/' : '/sign-in'" aria-label="Parenthesis">
        <app-logo [decorative]="true" />
      </a>
    </header>
    <main id="auth-main" tabindex="-1">
      <div class="card" [class.wide]="wide">
        <router-outlet />
      </div>
    </main>
    <footer class="auth-footer">
      <a
        routerLink="/privacy"
        routerLinkActive
        #privacy="routerLinkActive"
        [attr.aria-current]="privacy.isActive ? 'page' : null"
        >Privacy</a
      >
    </footer>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      padding: var(--space-6) var(--space-4) var(--space-8);
    }
    .auth-header {
      display: flex;
      justify-content: center;
      margin-bottom: var(--space-6);
      font-size: 1.125rem;
    }
    .auth-header a {
      display: inline-flex;
      min-height: var(--target-min);
      align-items: center;
      text-decoration: none;
    }
    main:focus {
      outline: none;
    }
    .card {
      width: 100%;
      max-width: 28rem;
      margin-inline: auto;
      padding: var(--space-6) var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
    }
    .card.wide {
      max-width: 48rem;
    }
    .auth-footer {
      display: flex;
      justify-content: center;
      margin-top: var(--space-6);
    }
    .auth-footer a {
      display: inline-flex;
      min-height: var(--target-min);
      align-items: center;
      padding-inline: var(--space-2);
    }
    @media (min-width: 480px) {
      .card {
        padding: var(--space-8);
      }
    }
  `,
})
export class AuthLayout {
  /**
   * A long page, such as the Privacy Notice, gets a wider card. Anyone can read it, so its logo goes home ("/"), which
   * leads each visitor to their own start: sign-in, the profile picker, the parent app or the kids' space.
   */
  protected readonly wide = inject(ActivatedRoute).snapshot.data['wide'] === true;
}
