import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Logo } from '../../shared/brand/logo';

/**
 * A calm, single-column frame for signing in, registering and setting up a family. Provisional layout from the
 * design system; it will follow approved mockups when they arrive (docs/design/PAGE_DESIGNS.md).
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, Logo],
  template: `
    <a class="skip-link" href="#auth-main">Skip to main content</a>
    <header class="auth-header">
      <a routerLink="/sign-in" aria-label="Parenthesis">
        <app-logo [decorative]="true" />
      </a>
    </header>
    <main id="auth-main" tabindex="-1">
      <div class="card">
        <router-outlet />
      </div>
    </main>
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
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
    @media (min-width: 480px) {
      .card {
        padding: var(--space-8);
      }
    }
  `,
})
export class AuthLayout {}
