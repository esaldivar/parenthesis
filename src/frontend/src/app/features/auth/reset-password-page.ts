import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { FORM_STYLES } from './form-styles';

/** Opened from the reset email. Reads the one-time token, then removes it from the address bar. */
@Component({
  selector: 'app-reset-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Choose a new password</h1>

    @if (done()) {
      <div class="status" role="status">Your password has been changed. Other devices have been signed out.</div>
      <div class="links"><a routerLink="/sign-in">Sign in</a></div>
    } @else if (!linkValid()) {
      <div class="alert" role="alert">This link is invalid or has expired.</div>
      <div class="links"><a routerLink="/forgot-password">Request a new link</a></div>
    } @else {
      @if (error(); as error) {
        <div class="alert" role="alert">{{ error }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>New password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" required />
          <mat-hint>At least 12 characters.</mat-hint>
          @if (form.controls.password.invalid) {
            <mat-error>{{ passwordError() ?? 'Use at least 12 characters.' }}</mat-error>
          }
        </mat-form-field>
        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">Save new password</button>
        </div>
      </form>
    }
  `,
  styles: FORM_STYLES,
})
export class ResetPasswordPage implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly email = input<string>();
  readonly token = input<string>();

  private credentials: { email: string; token: string } | null = null;
  protected readonly linkValid = signal(true);
  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(12)]],
  });
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  ngOnInit(): void {
    const email = this.email();
    const token = this.token();
    this.credentials = email && token ? { email, token } : null;
    this.linkValid.set(this.credentials !== null);
    // Keep the email and one-time token out of browser history.
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || !this.credentials) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.resetPassword({ ...this.credentials, password: this.form.getRawValue().password });
      this.done.set(true);
    } catch (error) {
      const problem = toProblem(error);
      const passwordErrors = problem.errors['password'];
      if (problem.status === 400 && passwordErrors) {
        this.passwordError.set(passwordErrors.join(' '));
        this.form.controls.password.setErrors({ server: true });
        this.form.markAllAsTouched();
      } else if (problem.status === 400) {
        this.linkValid.set(false); // Used, expired or tampered token.
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
