import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { PARENT_PIN_PATTERN, isTrivialPin } from './pin-rules';
import { safeReturnUrl } from './safe-return-url';

function notTrivial(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && isTrivialPin(control.value) ? { trivial: true } : null;
}

/**
 * "Is this a shared family device?" (#153, owner decision October 28, 2026). Asked after a password sign-in on a
 * browser that isn't already this parent's shared device. "No" continues privately and registers nothing. "Yes" sets
 * the device up for 30 days, creating the parent's six-digit PIN if they have none, then shows the picker, where the
 * parent taps their circle and enters that PIN (owner decision, October 28, 2026). A failed setup never claims sharing
 * is on.
 */
@Component({
  selector: 'app-shared-device-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>Is this a shared family device?</h1>
    <p class="lead">
      On a shared family device, like a kitchen tablet, your family chooses their profile from “Who’s using
      Parenthesis?”. Only you and your approved children appear. You’ll use a six-digit parent PIN to get back into
      your profile, and your children use their own PINs.
    </p>
    <p class="note">
      Sharing lasts 30 days, then a parent signs in to set it up again. Don’t choose this on a public, work or
      borrowed device.
    </p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    @if (!choosingYes()) {
      <div class="actions">
        <button mat-flat-button type="button" (click)="choosingYes.set(true)">Yes, set up sharing</button>
        <button mat-stroked-button type="button" (click)="continuePrivately()">No, continue to my account</button>
      </div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="setUp()" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Name this device</mat-label>
          <input matInput formControlName="name" autocomplete="off" maxlength="60" required />
          <mat-hint>Like “Kitchen iPad”. Parents see it in their device list.</mat-hint>
          @if (form.controls.name.invalid) {
            <mat-error>Give this device a name.</mat-error>
          }
        </mat-form-field>

        @if (needsPin()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Choose your parent PIN</mat-label>
            <input
              matInput
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              formControlName="pin"
              required
            />
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
            <mat-label>Type your parent PIN again</mat-label>
            <input
              matInput
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="6"
              formControlName="confirm"
              required
            />
            @if (form.controls.confirm.invalid) {
              <mat-error>The two PINs don’t match.</mat-error>
            }
          </mat-form-field>
        }

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Setting up…' : 'Set up sharing' }}</button>
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="continuePrivately()">
            No, continue to my account
          </button>
        </div>
      </form>
    }
  `,
  styles: [
    FORM_STYLES,
    `
      .lead {
        margin-bottom: var(--space-3);
      }
      .note {
        margin: 0 0 var(--space-6);
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class SharedDeviceSetupPage implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Where the parent was heading when they signed in; only in-app paths are honoured. */
  readonly returnUrl = input<string>();

  protected readonly choosingYes = signal(false);
  /** Whether this parent still needs to choose their parent PIN. Assume yes until the API says otherwise. */
  protected readonly needsPin = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/\S/)]],
    pin: ['', [Validators.required, Validators.pattern(PARENT_PIN_PATTERN), notTrivial]],
    confirm: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const family = this.auth.currentFamily();
    if (!family) {
      return;
    }
    try {
      const status = await this.api.parentPinStatus(family.id);
      this.needsPin.set(!status.isSet);
    } catch {
      // Keep asking for a PIN: the server ignores it when the parent already has one.
    }
  }

  protected async continuePrivately(): Promise<void> {
    this.auth.declineSharedSetup();
    await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
  }

  protected async setUp(): Promise<void> {
    const { name, pin, confirm } = this.form.getRawValue();
    if (this.needsPin() && pin !== confirm) {
      this.form.controls.confirm.setErrors({ mismatch: true });
    }
    const invalid = this.needsPin() ? this.form.invalid : this.form.controls.name.invalid;
    if (invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const family = this.auth.currentFamily();
    if (!family) {
      this.error.set('We couldn’t set up sharing. Try again.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.setUpSharedDevice(family.id, name.trim(), this.needsPin() ? pin : null);
      // Straight to "Who's using Parenthesis?" (owner decision, October 28, 2026): the parent sees their own circle and
      // the children's, and enters with the PIN they just chose. The setup session ends first, so nobody stays signed in
      // behind the picker.
      await this.auth.switchProfile();
      await this.router.navigateByUrl('/profiles', { replaceUrl: true });
    } catch (error) {
      const problem = toProblem(error);
      const fieldError = problem.errors['pin']?.join(' ') ?? problem.errors['name']?.join(' ');
      this.error.set(
        fieldError ?? (problem.status === 0 || problem.status >= 500 ? 'We couldn’t set up sharing. Try again.' : generalMessage(problem)),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
