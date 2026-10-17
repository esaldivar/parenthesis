import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** First run for a parent without a family: create one. Co-parents join by invitation (coming next). */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h1>Welcome, {{ auth.user()?.displayName }}</h1>
    <p class="lead">
      Set up your family space. You’ll be able to invite your co-parent next; you’ll both have the same say.
    </p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Family name</mat-label>
        <input matInput formControlName="name" required maxlength="80" />
        <mat-hint>For example, “Rivera Family”. Only your family sees it.</mat-hint>
        @if (form.controls.name.invalid) {
          <mat-error>Enter a family name.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Time zone</mat-label>
        <mat-select formControlName="timeZone" required>
          @for (zone of timeZones; track zone) {
            <mat-option [value]="zone">{{ zone }}</mat-option>
          }
        </mat-select>
        <mat-hint>Used to show family events at the right local time.</mat-hint>
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create family' }}</button>
        <button mat-button type="button" (click)="signOut()">Sign out</button>
      </div>
    </form>
  `,
  styles: FORM_STYLES,
})
export class WelcomePage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  private readonly deviceZone = deviceTimeZone();
  protected readonly timeZones: readonly string[] = Array.from(
    new Set([this.deviceZone, ...(Intl.supportedValuesOf?.('timeZone') ?? []), 'UTC']),
  );
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    timeZone: [this.deviceZone, Validators.required],
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
      const { name, timeZone } = this.form.getRawValue();
      await this.auth.createFamily(name.trim(), timeZone);
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
