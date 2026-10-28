import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, ParentPinStatus } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Toasts } from '../../shared/toast/toasts';
import { PARENT_PIN_PATTERN, isTrivialPin } from '../profiles/pin-rules';

function notTrivial(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && isTrivialPin(control.value) ? { trivial: true } : null;
}

/**
 * The parent's own six-digit PIN for shared family devices (#153). Choosing or changing it needs the account
 * password, and a new PIN clears a pause or lock: this is how a forgotten, paused or locked parent PIN is reset.
 */
@Component({
  selector: 'app-parent-pin-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (status(); as status) {
      <p>
        @if (status.locked) {
          Your parent PIN is locked after too many wrong tries. Choose a new PIN to use it again.
        } @else if (status.pausedUntil) {
          Your parent PIN is paused until {{ status.pausedUntil | date: 'shortTime' }}. You can also choose a new one now.
        } @else if (status.isSet) {
          You use your parent PIN to get back into your profile on a shared family device.
        } @else {
          You don’t have a parent PIN yet. You’ll need one to use a shared family device.
        }
      </p>

      @if (!open()) {
        <div class="actions">
          <button mat-stroked-button type="button" (click)="open.set(true)">
            {{ status.isSet ? 'Change parent PIN' : 'Choose a parent PIN' }}
          </button>
        </div>
      } @else {
        <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Your account password</mat-label>
            <input matInput type="password" autocomplete="current-password" formControlName="currentPassword" required />
            @if (form.controls.currentPassword.hasError('wrong')) {
              <mat-error>That password isn’t right.</mat-error>
            } @else if (form.controls.currentPassword.invalid) {
              <mat-error>Enter your password to confirm it’s you.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>New parent PIN</mat-label>
            <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="pin" required />
            <mat-hint>6 numbers, not all the same or in a run like 123456</mat-hint>
            @if (form.controls.pin.hasError('required')) {
              <mat-error>Choose a six-digit PIN.</mat-error>
            } @else if (form.controls.pin.hasError('pattern')) {
              <mat-error>Your parent PIN is 6 numbers.</mat-error>
            } @else if (form.controls.pin.hasError('trivial')) {
              <mat-error>Choose numbers that aren’t all the same or in a simple run.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Type the new PIN again</mat-label>
            <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="confirm" required />
            @if (form.controls.confirm.invalid) {
              <mat-error>The two PINs don’t match.</mat-error>
            }
          </mat-form-field>
          <div class="actions">
            <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save PIN' }}</button>
            <button mat-button type="button" [disabled]="busy()" (click)="cancel()">Cancel</button>
          </div>
        </form>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    p {
      margin: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    button {
      min-height: var(--target-min);
    }
    .panel {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-control);
    }
    mat-form-field {
      width: 100%;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .alert {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class ParentPinSettings implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(Toasts);

  readonly familyId = input.required<string>();

  protected readonly status = signal<ParentPinStatus | null>(null);
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    pin: ['', [Validators.required, Validators.pattern(PARENT_PIN_PATTERN), notTrivial]],
    confirm: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected cancel(): void {
    this.form.reset();
    this.open.set(false);
  }

  protected async save(): Promise<void> {
    const { currentPassword, pin, confirm } = this.form.getRawValue();
    if (pin !== confirm) {
      this.form.controls.confirm.setErrors({ mismatch: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.setParentPin(this.familyId(), currentPassword, pin);
      this.cancel();
      this.toasts.show('Your new parent PIN works now.');
      await this.reload();
      await this.auth.loadDevice().catch(() => undefined);
    } catch (error) {
      const problem = toProblem(error);
      if (problem.errors['currentPassword']) {
        this.form.controls.currentPassword.setErrors({ wrong: true });
        this.form.controls.currentPassword.markAsTouched();
      } else {
        this.error.set(problem.errors['pin']?.join(' ') ?? generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.status.set(await this.api.parentPinStatus(this.familyId()));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }
}
