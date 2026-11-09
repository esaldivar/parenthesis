import { TranslatePipe } from '../../core/i18n/translations';
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
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>{{ 'feature.set.up.a.child.s.tablet' | tr }}</h1>
    <p class="lead">{{ 'feature.on.your.phone.open.settings.choose.your' | tr }}</p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'feature.code' | tr }}</mat-label>
        <input
          matInput
          formControlName="code"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="11"
          required
        />
        <mat-hint>{{ 'feature.8.letters.and.numbers.like.abcd.2345' | tr }}</mat-hint>
        @if (form.controls.code.hasError('required')) {
          <mat-error>{{ 'feature.enter.the.code.from.your.phone' | tr }}</mat-error>
        } @else if (form.controls.code.hasError('pattern')) {
          <mat-error>{{ 'feature.the.code.has.8.letters.and.numbers' | tr }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'feature.name.this.tablet' | tr }}</mat-label>
        <input matInput formControlName="deviceName" autocomplete="off" maxlength="60" required />
        <mat-hint>{{ 'feature.you.ll.see.it.in.your.list' | tr }}</mat-hint>
        @if (form.controls.deviceName.hasError('required')) {
          <mat-error>{{ 'feature.give.this.tablet.a.name' | tr }}</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Setting up…' : 'Set up this tablet' }}</button>
      </div>
    </form>

    <div class="links">
      <a routerLink="/sign-in">{{ 'feature.sign.in.instead' | tr }}</a>
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
