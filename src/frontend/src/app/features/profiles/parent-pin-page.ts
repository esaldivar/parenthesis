import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormGroupDirective, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { FORM_STYLES } from '../auth/form-styles';
import { PARENT_PIN_PATTERN } from './pin-rules';

/**
 * A parent enters their own profile on their shared family device with their six-digit PIN (#153; approved parent
 * PIN entry and pause directions). Three wrong PINs pause it for ten minutes and email that parent; three more lock
 * it until they choose a new PIN. Password sign-in always stays available, and is how a forgotten PIN is reset.
 * The PIN is a labelled, masked numeric field that works with a physical keyboard, paste and leading zeros.
 */
@Component({
  selector: 'app-parent-pin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, Avatar],
  template: `
    <div class="who">
      <app-avatar [name]="name()" kind="parent" [size]="72" [src]="tile()?.photoUrl" />
      <h1>Hi, {{ name() }}</h1>
    </div>

    @if (state() === 'paused') {
      <div class="status" role="status">
        <p class="status__title">Your parent PIN is paused.</p>
        <p>
          Too many wrong tries. You can try again after {{ retryAt() | date: 'shortTime' }}, or sign in with your email
          and password to reset your PIN.
        </p>
        @if (notified() === true) {
          <p>We’ve emailed you about this.</p>
        } @else if (notified() === false) {
          <p>We couldn’t send you an email about this right now.</p>
        }
        <div class="actions">
          <button mat-stroked-button type="button" (click)="tryAgain()">Try again</button>
        </div>
      </div>
    } @else if (state() === 'locked') {
      <div class="status" role="status">
        <p class="status__title">Your parent PIN is locked.</p>
        <p>
          Sign in with your email and password, then choose a new PIN in Settings. Your account isn’t locked, and other
          profiles on this device still work.
        </p>
        @if (notified() === true) {
          <p>We’ve emailed you instructions.</p>
        } @else if (notified() === false) {
          <p>We couldn’t send you an email about this right now.</p>
        }
      </div>
    } @else {
      <p class="lead">Enter your parent PIN to continue.</p>

      @if (error(); as error) {
        <div class="alert" role="alert">{{ error }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Parent PIN</mat-label>
          <input
            matInput
            type="password"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            formControlName="pin"
            required
          />
          <mat-hint>6 numbers</mat-hint>
          @if (form.controls.pin.hasError('required')) {
            <mat-error>Enter your parent PIN.</mat-error>
          } @else if (form.controls.pin.hasError('pattern')) {
            <mat-error>Your parent PIN is 6 numbers.</mat-error>
          }
        </mat-form-field>

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Checking…' : 'Continue' }}</button>
        </div>
      </form>
    }

    <div class="reset">
      @if (resetMessage(); as message) {
        <p role="status">{{ message }}</p>
      }
      <button mat-stroked-button type="button" [disabled]="resetBusy()" (click)="requestReset()">
        {{ resetBusy() ? 'Sending…' : 'Forgot your PIN? Email me a reset link' }}
      </button>
    </div>

    <div class="links">
      <a routerLink="/profiles" [replaceUrl]="true">Back to profiles</a>
      <a [routerLink]="['/profiles', 'parent', id(), 'password']">
        Sign in with your password
      </a>
    </div>
  `,
  styles: [
    FORM_STYLES,
    `
      .who {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
        text-align: center;
        overflow-wrap: anywhere;
      }
      .lead {
        text-align: center;
      }
      .reset {
        display: grid;
        gap: var(--space-2);
        margin-top: var(--space-4);
      }
      .reset p {
        margin: 0;
      }
      .reset button {
        min-height: var(--target-min);
      }
      .status__title {
        font-weight: 600;
      }
      .status p {
        margin: 0;
      }
      .status p + p {
        margin-top: var(--space-1);
      }
    `,
  ],
})
export class ParentPinPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** The parent's membership id, from the route. */
  readonly id = input.required<string>();

  protected readonly tile = computed(() => this.auth.device()?.profiles.find((p) => p.kind === 'parent' && p.id === this.id()));
  protected readonly name = computed(() => this.tile()?.name ?? 'there');

  private readonly answer = signal<{ state: 'paused' | 'locked'; retryAt?: string; notified?: boolean } | null>(null);
  /** Set by "Try again": show the form again. Only the server decides whether the pause is over. */
  private readonly retrying = signal(false);
  /** From this page's last answer, or from the picker when the PIN was already paused or locked. */
  protected readonly state = computed(() => {
    const answer = this.answer();
    if (answer) {
      return answer.state;
    }
    const tile = this.tile();
    return tile?.locked ? 'locked' : tile?.pausedUntil && Date.parse(tile.pausedUntil) > Date.now() && !this.retrying() ? 'paused' : null;
  });
  protected readonly retryAt = computed(() => this.answer()?.retryAt ?? this.tile()?.pausedUntil ?? null);
  protected readonly notified = computed(() => this.answer()?.notified);

  protected readonly form = inject(NonNullableFormBuilder).group({
    pin: ['', [Validators.required, Validators.pattern(PARENT_PIN_PATTERN)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly formDirective = viewChild(FormGroupDirective);

  protected readonly resetBusy = signal(false);
  protected readonly resetMessage = signal<string | null>(null);

  /** Emails this parent a single-use, 15-minute reset link. Only says it was sent when the mail server accepted it. */
  protected async requestReset(): Promise<void> {
    this.resetBusy.set(true);
    this.resetMessage.set(null);
    try {
      const { notified } = await this.api.requestParentPinReset(this.id());
      this.resetMessage.set(
        notified
          ? 'We’ve emailed you a reset link. It works once, for 15 minutes, and you’ll sign in with your password first.'
          : 'We couldn’t send the email right now. You can sign in with your password and choose a new PIN in Settings.',
      );
    } catch (error) {
      const problem = toProblem(error);
      this.resetMessage.set(
        problem.status === 429
          ? 'We sent you a reset link recently. Check your email, or ask again in a few minutes.'
          : problem.status === 403
            ? 'Sign in with your email and password, then choose a new PIN in Settings.'
            : generalMessage(problem),
      );
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected tryAgain(): void {
    this.answer.set(null);
    this.retrying.set(true);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.parentPinSignIn(this.id(), this.form.getRawValue().pin);
      // Replace the PIN page in history: Back from the parent's home never returns to it.
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (error) {
      const problem = toProblem(error);
      this.formDirective()?.resetForm();
      if (problem.status === 423 && (problem.state === 'paused' || problem.state === 'locked')) {
        this.answer.set({ state: problem.state, retryAt: problem.retryAt, notified: problem.notified });
      } else if (problem.status === 409 && problem.state === 'no-pin') {
        await this.router.navigate(['/profiles', 'parent', this.id(), 'password'], { replaceUrl: true });
      } else if (problem.status === 401) {
        const left = problem.triesLeft;
        this.error.set(`That PIN didn’t work.${left ? ` ${left === 1 ? '1 try' : `${left} tries`} left.` : ''}`);
      } else if (problem.status === 403) {
        this.error.set('Your profile can’t use a PIN on this device. Sign in with your email and password.');
      } else if (problem.status === 409) {
        this.error.set('We couldn’t check that PIN. Please try again.');
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
