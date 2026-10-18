import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
 * A child unlocks their profile with their PIN (ADR-0006). Three wrong tries lock it; the API emails both parents,
 * and a parent unlocks it. The wording stays calm and never mentions what parents decide between themselves.
 */
@Component({
  selector: 'app-child-pin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, Avatar],
  template: `
    <div class="who">
      <app-avatar [name]="name()" [size]="72" />
      <h1>Hi, {{ name() }}</h1>
    </div>

    @if (locked()) {
      <div class="status" role="status">
        <p class="status__title">Your profile is locked.</p>
        <p>We’ve let your parents know. Ask a parent to unlock it.</p>
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
      <a routerLink="/profiles">Back to profiles</a>
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

  private readonly tile = computed(() => this.auth.device()?.profiles.find((p) => p.kind === 'child' && p.id === this.id()));
  protected readonly name = computed(() => this.tile()?.name ?? 'there');
  private readonly lockedNow = signal(false);
  protected readonly locked = computed(() => this.lockedNow() || (this.tile()?.locked ?? false));

  protected readonly form = inject(NonNullableFormBuilder).group({
    pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN)]],
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
      await this.auth.childSignIn(this.id(), this.form.getRawValue().pin);
      await this.router.navigateByUrl('/kid');
    } catch (error) {
      const problem = toProblem(error);
      this.form.reset();
      if (problem.status === 423) {
        this.lockedNow.set(true);
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
