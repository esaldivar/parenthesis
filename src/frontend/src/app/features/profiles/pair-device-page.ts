import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';

/** 8 letters and numbers, with or without the dash; case and spaces don't matter (the API normalizes them). */
const CODE_PATTERN = /^\s*[A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{4}\s*$/;

/**
 * On the child's own tablet (A-11): type the code a parent shows on their phone, and the tablet becomes that one
 * child's device. Nobody signs in here, and any session already on this browser ends. A QR code is deferred
 * (owner decision, October 18, 2026).
 */
@Component({
  selector: 'app-pair-device-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Set up a child’s tablet</h1>
    <p class="lead">On your phone, open Settings, choose your child and tap “Pair a tablet”. Then enter the code here.</p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Code</mat-label>
        <input
          matInput
          formControlName="code"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="11"
          required
        />
        <mat-hint>8 letters and numbers, like ABCD-2345</mat-hint>
        @if (form.controls.code.hasError('required')) {
          <mat-error>Enter the code from your phone.</mat-error>
        } @else if (form.controls.code.hasError('pattern')) {
          <mat-error>The code has 8 letters and numbers, like ABCD-2345.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Name this tablet</mat-label>
        <input matInput formControlName="deviceName" autocomplete="off" maxlength="60" required />
        <mat-hint>You’ll see it in your list of devices, like “Kai’s tablet”</mat-hint>
        @if (form.controls.deviceName.hasError('required')) {
          <mat-error>Give this tablet a name.</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Setting up…' : 'Set up this tablet' }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/sign-in">Sign in instead</a>
    </div>
  `,
  styles: FORM_STYLES,
})
export class PairDevicePage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
    deviceName: ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/\S/)]],
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
      const { code, deviceName } = this.form.getRawValue();
      await this.auth.pairDevice(code.trim(), deviceName.trim());
      await this.router.navigateByUrl('/profiles');
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(
        problem.status === 404
          ? 'That code didn’t work. Codes work once and only for 10 minutes. Ask for a new one on the parent’s phone.'
          : (problem.errors['deviceName']?.join(' ') ?? generalMessage(problem)),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
