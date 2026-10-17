import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { FORM_STYLES } from './form-styles';

@Component({
  selector: 'app-check-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule],
  template: `
    <h1>Check your email</h1>
    @if (email) {
      <p class="lead">We’ve sent a confirmation link to <strong>{{ email }}</strong>. Open it to finish setting up your account.</p>
    } @else {
      <p class="lead">We’ve sent you a confirmation link. Open it to finish setting up your account.</p>
    }

    <div aria-live="polite">
      @if (message(); as message) {
        <div class="status">{{ message }}</div>
      }
    </div>

    @if (email) {
      <div class="actions">
        <button mat-stroked-button type="button" (click)="resend()" [disabled]="busy()">Send the link again</button>
      </div>
    }

    <div class="links">
      <a routerLink="/sign-in">Back to sign in</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class CheckEmailPage {
  private readonly api = inject(Api);

  /** Passed in navigation state by the register page; absent after a reload, which is fine. */
  protected readonly email: string | undefined = inject(Router).currentNavigation()?.extras.state?.['email'];
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.resendConfirmation(this.email!);
      this.message.set('If that account still needs confirming, a new link is on its way.');
    } catch (error) {
      this.message.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
