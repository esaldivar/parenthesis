import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { FORM_STYLES } from './form-styles';

const MIN_PASSWORD = 12; // Matches the API's policy (NIST 800-63B: length, not composition rules).

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Create your account</h1>
    <p class="lead">For parents and caregivers. Children get their own sign-in later, set up by a parent.</p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Your name</mat-label>
        <input matInput formControlName="displayName" autocomplete="name" required maxlength="80" />
        <mat-hint>Shown to your co-parent.</mat-hint>
        @if (form.controls.displayName.invalid) {
          <mat-error>{{ serverErrors()['displayName'] ?? 'Enter your name.' }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="email" required />
        @if (form.controls.email.invalid) {
          <mat-error>{{ serverErrors()['email'] ?? 'Enter a valid email address.' }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Password</mat-label>
        <input matInput type="password" formControlName="password" autocomplete="new-password" required />
        <mat-hint>At least {{ minPassword }} characters. A few unrelated words works well.</mat-hint>
        @if (form.controls.password.invalid) {
          <mat-error>{{ serverErrors()['password'] ?? 'Use at least ' + minPassword + ' characters.' }}</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Creating account…' : 'Create account' }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/sign-in">Already have an account? Sign in</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class RegisterPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly minPassword = MIN_PASSWORD;
  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    const { displayName, email, password } = this.form.getRawValue();
    try {
      await this.api.register({ displayName: displayName.trim(), email: email.trim(), password });
      // The email travels in navigation state, not the URL, so it stays out of history and logs.
      await this.router.navigateByUrl('/check-email', { state: { email: email.trim() } });
    } catch (error) {
      const problem = toProblem(error);
      const fields = Object.entries(problem.errors).filter(([field]) => field in this.form.controls);
      if (problem.status === 400 && fields.length > 0) {
        this.serverErrors.set(Object.fromEntries(fields.map(([field, messages]) => [field, messages.join(' ')])));
        for (const [field] of fields) {
          this.form.get(field)!.setErrors({ server: true });
        }
        this.form.markAllAsTouched();
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
