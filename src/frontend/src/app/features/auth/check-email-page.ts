import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { LocaleService } from '../../core/i18n/locale.service';
import { FORM_STYLES } from './form-styles';

@Component({
  selector: 'app-check-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, TranslatePipe],
  template: `
    <h1>{{ 'check.title' | tr }}</h1>
    @if (email) {
      <p class="lead">{{ 'check.sentPrefix' | tr }} <strong>{{ email }}</strong>. {{ 'check.sentSuffix' | tr }}</p>
    } @else {
      <p class="lead">{{ 'check.sentGeneric' | tr }}</p>
    }

    <div aria-live="polite">
      @if (message(); as message) {
        <div class="status">{{ message }}</div>
      }
    </div>

    @if (email) {
      <div class="actions">
        <button mat-stroked-button type="button" (click)="resend()" [disabled]="busy()">{{ 'check.resend' | tr }}</button>
      </div>
    }

    <div class="links">
      <a routerLink="/sign-in">{{ 'auth.back' | tr }}</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class CheckEmailPage {
  private readonly api = inject(Api);
  private readonly locale = inject(LocaleService);

  /** Passed in navigation state by the register page; absent after a reload, which is fine. */
  protected readonly email: string | undefined = inject(Router).currentNavigation()?.extras.state?.['email'];
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.resendConfirmation(this.email!);
      this.message.set(translate('check.resendSuccess', this.locale.locale()));
    } catch (error) {
      this.message.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
