import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { FORM_STYLES } from './form-styles';

@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Reset your password</h1>
    <p class="lead">Enter your email and we’ll send you a link to choose a new password.</p>

    <div aria-live="polite">
      @if (sent()) {
        <div class="status">If there’s an account for that email, a reset link is on its way. It works once.</div>
      }
    </div>
    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="email" required />
        @if (form.controls.email.invalid) {
          <mat-error>Enter a valid email address.</mat-error>
        }
      </mat-form-field>
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">Send reset link</button>
      </div>
    </form>

    <div class="links"><a routerLink="/sign-in">Back to sign in</a></div>
  `,
  styles: FORM_STYLES,
})
export class ForgotPasswordPage {
  private readonly api = inject(Api);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.forgotPassword(this.form.getRawValue().email.trim());
      this.sent.set(true); // The same message whether or not the account exists.
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
