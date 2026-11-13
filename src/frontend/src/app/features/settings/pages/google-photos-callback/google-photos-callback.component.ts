import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Api } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { Toasts } from '../../../../shared/components/toast/toasts';

/**
 * Where Google sends a parent back after its consent page (#404). Finishes connecting with the one-time code, then
 * returns to the memory they started from (the server reads it from its own encrypted state, so this never follows
 * an address from the URL) or to Settings. The code leaves the address bar straight away.
 */
@Component({
  selector: 'app-google-photos-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, MatButtonModule],
  template: `
    <h1>Google Photos</h1>
    <section class="card">
      @if (message(); as message) {
        <p role="alert">{{ message }}</p>
        <a mat-stroked-button routerLink="/settings">{{ 'feature.back.to.settings' | tr }}</a>
      } @else {
        <p role="status">{{ 'feature.connecting.google.photos' | tr }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }
    .card {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
    }
    p {
      margin: 0;
    }
    a {
      min-height: var(--target-min);
    }
  `,
})
export class GooglePhotosCallback implements OnInit {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly route = inject(ActivatedRoute);

  protected readonly message = signal<string | null>(null);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const [code, state, denied] = [params.get('code'), params.get('state'), params.get('error')];
    // Drop the code from the address bar and history before anything else.
    await this.router.navigate([], { queryParams: {}, replaceUrl: true });

    const family = this.auth.currentFamily();
    if (denied || !code || !state) {
      this.message.set(
        denied === 'access_denied'
          ? translate('google.photos.denied', this.copyLocale.locale())
          : translate('google.photos.connectError', this.copyLocale.locale()),
      );
      return;
    }
    if (family?.role !== 'Parent') {
      this.message.set(translate('google.photos.parentOnly', this.copyLocale.locale()));
      return;
    }

    try {
      const status = await this.api.googlePhotosConnect(family.id, code, state);
      this.toasts.show(translate('google.photos.connected', this.copyLocale.locale()));
      await this.router.navigateByUrl(
        status.returnEventId
          ? `/memories/${encodeURIComponent(status.returnEventId)}`
          : '/settings',
        { replaceUrl: true },
      );
    } catch (error) {
      const problem = toProblem(error);
      this.message.set(
        Object.values(problem.errors).flat()[0] ?? problem.detail ?? generalMessage(problem),
      );
    }
  }
}
