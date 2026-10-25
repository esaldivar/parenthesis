import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';

/** A parent tile always asks for that parent's full password, never a PIN (ADR-0006). */
@Component({
  selector: 'app-parent-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Hi, {{ name() }}</h1>
    <p class="lead">Enter your email and password to continue.</p>

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
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Continue' }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/profiles">Back to profiles</a>
      <a routerLink="/forgot-password">Forgot your password?</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class ParentPasswordPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** The parent's membership id, from the route. */
  readonly id = input.required<string>();

  protected readonly name = computed(
    () => this.auth.device()?.profiles.find((p) => p.kind === 'parent' && p.id === this.id())?.name ?? 'there',
  );
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
      await this.router.navigateByUrl('/');
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(
        problem.status === 401 ? 'We couldn’t sign you in with that email and password.' : generalMessage(problem),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
