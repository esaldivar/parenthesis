import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { PendingInvitation } from '../../core/invitations/pending-invitation';
import { FORM_STYLES } from './form-styles';

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Sign in</h1>
    <p class="lead">Welcome back.</p>

    @if (accountDeleted()) {
      <div class="status" role="status">
        Your account has been deleted. We've sent a confirmation to your email. You're welcome back any time.
      </div>
    }
    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="username" required />
        @if (form.controls.email.hasError('required')) {
          <mat-error>Enter your email address.</mat-error>
        } @else if (form.controls.email.hasError('email')) {
          <mat-error>Enter a valid email address.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Password</mat-label>
        <input matInput type="password" formControlName="password" autocomplete="current-password" required />
        @if (form.controls.password.hasError('required')) {
          <mat-error>Enter your password.</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/forgot-password">Forgot your password?</a>
      <a routerLink="/register">Create an account</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class SignInPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingInvitation);

  /** Where to go after signing in (from the guard); only in-app paths are honoured. */
  readonly returnUrl = input<string>();
  /** Set after deleting an account (A-12), to confirm it here. */
  readonly accountDeleted = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email.trim(), password);
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch (error) {
      const problem = toProblem(error);
      // The API gives one answer for every failed sign-in, so the page doesn't guess at the reason.
      this.error.set(
        problem.status === 401
          ? 'We couldn’t sign you in with that email and password. If you’ve just registered, confirm your email first.'
          : generalMessage(problem),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private safeReturnUrl(): string {
    const url = this.returnUrl();
    // Only paths within the app, never "//evil.example" or absolute URLs (open redirect).
    if (url && url.startsWith('/') && !url.startsWith('//')) {
      return url;
    }
    // Back from confirming their email, an invited co-parent goes straight to their invitation.
    return this.pending.peek() ? '/invitations/accept' : '/';
  }
}
