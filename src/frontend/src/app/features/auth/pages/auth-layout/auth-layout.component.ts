import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LocaleService, AppLocale } from '../../../../core/i18n/locale.service';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { Logo } from '../../../../shared/components/brand/logo';

/**
 * A calm, single-column frame for signing in, registering and setting up a family. Provisional layout from the
 * design system; it will follow approved mockups when they arrive (docs/design/PAGE_DESIGNS.md).
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, TranslatePipe],
  template: `
    <a class="skip-link" href="#auth-main">{{ 'auth.skip' | tr }}</a>
    <header class="auth-header">
      <a [routerLink]="wide ? '/' : '/sign-in'" aria-label="Parenthesis">
        <app-logo [decorative]="true" layout="responsive" />
      </a>
      <div class="language-picker">
        <label for="auth-language">{{ 'auth.language' | tr }}</label>
        <select id="auth-language" [value]="locale.locale()" (change)="changeLanguage($event)">
          <option value="en">English</option>
          <option value="es-419">Español</option>
        </select>
      </div>
    </header>
    <main id="auth-main" tabindex="-1">
      <div class="card" [class.wide]="wide" [class.bare]="bare">
        <router-outlet />
      </div>
    </main>
    <footer class="auth-footer">
      <a
        routerLink="/privacy"
        routerLinkActive
        #privacy="routerLinkActive"
        [attr.aria-current]="privacy.isActive ? 'page' : null"
        >{{ 'feature.privacy' | tr }}</a
      >
    </footer>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      padding: var(--space-6) var(--space-4) var(--space-8);
    }
    /* Decorative botanical art behind the card on wider screens (Figma Request #1, #697). */
    @media (min-width: 768px) {
      :host {
        background: url('/art/auth/botanical-light.webp') center bottom / cover no-repeat;
      }
      :host-context(html[data-theme='dark']) {
        background-image: url('/art/auth/botanical-dark.webp');
      }
    }
    @media (min-width: 768px) and (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme])) {
        background-image: url('/art/auth/botanical-dark.webp');
      }
    }
    @media (forced-colors: active), print {
      :host {
        background-image: none !important;
      }
    }
    .auth-header {
      display: flex;
      flex-wrap: wrap;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2) var(--space-3);
      margin-bottom: var(--space-6);
      font-size: 1.125rem;
    }
    .language-picker {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.875rem;
    }
    .language-picker select {
      min-height: var(--target-min);
      max-width: 9rem;
      background: var(--color-surface);
      color: inherit;
      border: 1px solid var(--color-divider);
      border-radius: 0.5rem;
      padding-inline: var(--space-2);
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
    /* Phones show the page straight on the canvas; from 480 px it sits in a card (Figma Request #1). */
    .card {
      width: 100%;
      max-width: 28rem;
      margin-inline: auto;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-card);
    }
    .card.wide {
      max-width: 48rem;
    }
    /* The profile picker: photo circles straight on the page at every width, no card. */
    .card.bare {
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
      .auth-header {
        flex-direction: row;
      }
      .card:not(.bare) {
        padding: var(--space-8);
        background: var(--color-surface);
        border-color: var(--color-divider);
      }
    }
  `,
})
export class AuthLayout {
  /**
   * A long page, such as the Privacy Notice, gets a wider card. Anyone can read it, so its logo goes home ("/"), which
   * leads each visitor to their own start: sign-in, the profile picker, the parent app or the kids' space.
   */
  protected readonly locale = inject(LocaleService);

  protected changeLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'en' || value === 'es-419') this.locale.setLocale(value as AppLocale);
  }

  protected readonly wide = inject(ActivatedRoute).snapshot.data['wide'] === true;
  /** Pages that draw their own layout straight on the page, without the card (the profile picker). */
  protected readonly bare = inject(ActivatedRoute).snapshot.data['bare'] === true;
}
