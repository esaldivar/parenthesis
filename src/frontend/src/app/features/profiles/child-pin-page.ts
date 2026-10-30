import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormGroupDirective, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { FORM_STYLES } from '../auth/form-styles';

/** A PIN is 4 to 6 digits; the parent chose its length when setting it (owner decision, October 18, 2026). */
export const PIN_PATTERN = /^\d{4,6}$/;

/**
 * A child enters their profile with their PIN (ADR-0006, #153). Three wrong tries pause it for ten minutes, with a
 * friendly on-screen message and no email; three more lock it until a parent chooses a new PIN, and the API emails
 * the parents. The page only says parents were told when the email was actually sent. The wording stays calm and
 * never mentions what parents decide between themselves. Variable-length PINs need the explicit Go button.
 */
@Component({
  selector: 'app-child-pin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, Avatar],
  template: `
    <div class="who">
      <app-avatar [name]="name()" [size]="72" [src]="tile()?.photoUrl" />
      <h1>Hi, {{ name() }}</h1>
    </div>

    @if (state() === 'locked') {
      <div class="status" role="status">
        <p class="status__title">Your PIN is locked.</p>
        <p>Ask a parent to help you choose a new PIN.</p>
        @if (notified() === true) {
          <p>We’ve let your parents know.</p>
        }
      </div>
    } @else if (state() === 'paused') {
      <div class="status" role="status">
        <p class="status__title">Let’s take a short break.</p>
        <p>
          That was a few wrong tries. Ask a parent for help, or try again after
          {{ retryAt() | date: 'shortTime' }}.
        </p>
        <div class="actions">
          <button mat-stroked-button type="button" (click)="tryAgain()">Try again</button>
        </div>
      </div>
    } @else {
      <p class="lead">Type your PIN.</p>

      @if (error(); as error) {
        <div class="alert" role="alert">{{ error }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>PIN</mat-label>
          <input
            matInput
            type="password"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            formControlName="pin"
            required
          />
          <mat-hint>4 to 6 numbers</mat-hint>
          @if (form.controls.pin.hasError('required')) {
            <mat-error>Type your PIN.</mat-error>
          } @else if (form.controls.pin.hasError('pattern')) {
            <mat-error>Your PIN is 4 to 6 numbers.</mat-error>
          }
        </mat-form-field>

        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Checking…' : 'Go' }}</button>
        </div>
      </form>
    }

    <div class="links">
      @if (!pairedTablet()) {
        <a routerLink="/profiles" [replaceUrl]="true">Back to profiles</a>
      }
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
      }
      .lead {
        text-align: center;
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
export class ChildPinPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** The child's id, from the route. */
  readonly id = input.required<string>();

  protected readonly tile = computed(() => this.auth.device()?.profiles.find((p) => p.kind === 'child' && p.id === this.id()));
  protected readonly name = computed(() => this.tile()?.name ?? 'there');
  /** A child's own tablet opens straight to this page, so there are no other profiles to go back to. */
  protected readonly pairedTablet = computed(() => this.auth.device()?.deviceKind === 'ChildPaired');
  private readonly answer = signal<{ state: 'paused' | 'locked'; retryAt?: string; notified?: boolean } | null>(null);
  /** Set by "Try again": show the form again. Only the server decides whether the break is over. */
  private readonly retrying = signal(false);
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
    pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly formDirective = viewChild(FormGroupDirective);

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
      await this.auth.childSignIn(this.id(), this.form.getRawValue().pin);
      // Replace the PIN page in history: Back from the child's space never returns to the picker or a parent page.
      await this.router.navigateByUrl('/kid', { replaceUrl: true });
    } catch (error) {
      const problem = toProblem(error);
      // A clean, empty box for the next try, without an "enter your PIN" error on top of the real message.
      this.formDirective()?.resetForm();
      if (problem.status === 423) {
        this.answer.set({ state: problem.state === 'paused' ? 'paused' : 'locked', retryAt: problem.retryAt, notified: problem.notified });
      } else if (problem.status === 409) {
        this.error.set('We couldn’t check that PIN. Please try again.');
      } else if (problem.status === 401) {
        const left = problem.triesLeft;
        this.error.set(`That PIN didn’t work.${left ? ` ${left === 1 ? '1 try' : `${left} tries`} left.` : ''}`);
      } else if (problem.status === 403) {
        this.error.set('This profile can’t sign in on this device. Ask a parent to set it up.');
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
