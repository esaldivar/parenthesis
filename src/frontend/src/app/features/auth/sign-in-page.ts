import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { PendingInvitation } from '../../core/invitations/pending-invitation';
import { safeReturnUrl } from '../profiles/safe-return-url';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { FORM_STYLES } from './form-styles';

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, TranslatePipe],
  template: `
    <h1>{{ 'signIn.title' | tr }}</h1>
    <p class="lead">{{ 'signIn.welcome' | tr }}</p>

    @if (accountDeleted()) {
      <div class="status" role="status">
        {{ 'signIn.deleted' | tr }}
      </div>
    }
    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'signIn.email' | tr }}</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="username" required />
        @if (form.controls.email.hasError('required')) {
          <mat-error>{{ 'signIn.emailRequired' | tr }}</mat-error>
        } @else if (form.controls.email.hasError('email')) {
          <mat-error>{{ 'signIn.emailInvalid' | tr }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'signIn.password' | tr }}</mat-label>
        <input matInput type="password" formControlName="password" autocomplete="current-password" required />
        @if (form.controls.password.hasError('required')) {
          <mat-error>{{ 'signIn.passwordRequired' | tr }}</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ (busy() ? 'signIn.loading' : 'signIn.title') | tr }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/forgot-password">{{ 'signIn.forgot' | tr }}</a>
      <a routerLink="/register">{{ 'signIn.register' | tr }}</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class SignInPage {
  private readonly auth = inject(AuthStore);
  private readonly locale = inject(LocaleService);
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
      const target = this.safeReturnUrl();
      // "Is this a shared family device?" is asked only after a fresh password sign-in, never answered for the parent
      // (#153). An invited co-parent answers their invitation first.
      if (!this.pending.peek() && (await this.auth.shouldOfferSharedSetup())) {
        await this.router.navigate(['/shared-device/setup'], { queryParams: target === '/' ? {} : { returnUrl: target } });
      } else {
        await this.router.navigateByUrl(target);
      }
    } catch (error) {
      const problem = toProblem(error);
      // The API gives one answer for every failed sign-in, so the page doesn't guess at the reason.
      this.error.set(
        problem.status === 401
          ? translate('signIn.invalidCredentials', this.locale.locale())
          : generalMessage(problem),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private safeReturnUrl(): string {
    // Only paths within the app, never "//evil.example", "/\\evil.example" or absolute URLs (open redirect). Back from
    // confirming their email, an invited co-parent goes straight to their invitation.
    return safeReturnUrl(this.returnUrl(), this.pending.peek() ? '/invitations/accept' : '/');
  }
}
