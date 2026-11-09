import { TranslatePipe } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';

/**
 * Delete account (A-12; owner decisions, October 20, 2026). Permanent at once, after the parent re-enters their
 * password and reads what will be removed. With a co-parent, the family, children and shared history stay with them
 * and this parent shows as "Former parent"; as the only parent, the family goes too. The API does all of it; this
 * page only explains it.
 */
@Component({
  selector: 'app-delete-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    @if (!open()) {
      <p class="muted">{{ 'feature.permanently.delete.your.parenthesis.account.and.your' | tr }}</p>
      <div class="actions actions--start">
        <button #deleteButton mat-stroked-button class="danger" type="button" (click)="start()">{{ 'feature.delete.account' | tr }}</button>
      </div>
    } @else {
      <div class="confirm">
        <p class="warning" #warning tabindex="-1"><strong>{{ 'feature.this.can.t.be.undone' | tr }}</strong> {{ 'feature.deleting.your.account' | tr }}</p>
        <ul>
          <li>{{ 'feature.removes.your.sign.in.your.name.and' | tr }}</li>
          @for (family of families(); track $index) {
            @if (family.coParentName; as coParent) {
              <li>
                {{ 'feature.leaves' | tr }} <strong>{{ family.name }}</strong> {{ 'feature.with' | tr }} <strong>{{ coParent }}</strong>{{ 'feature.the.family.your.children.and.your.shared' | tr }}
              </li>
              <li>{{ 'feature.withdraws.requests.you.re.waiting.on.and' | tr }}</li>
              <li>Sends {{ coParent }} an email that a parent has left. It doesn't include your name.</li>
            } @else {
              <li>
                {{ 'feature.deletes' | tr }} <strong>{{ family.name }}</strong> {{ 'feature.too.because.you.re.its.only.parent' | tr }}
              </li>
            }
          }
          <li>{{ 'feature.sends.you.a.confirmation.email' | tr }}</li>
        </ul>

        @if (error(); as error) {
          <div class="alert" role="alert">{{ error }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.your.password' | tr }}</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="current-password" required />
            <mat-hint>{{ 'feature.to.confirm.it.s.you' | tr }}</mat-hint>
            @if (form.controls.password.invalid) {
              <mat-error>{{ fieldError() ?? 'Enter your password.' }}</mat-error>
            }
          </mat-form-field>
          <div class="actions">
            <button mat-flat-button class="danger-fill" type="submit" [disabled]="busy()">
              {{ busy() ? 'Deleting…' : 'Delete my account' }}
            </button>
            <button mat-button type="button" [disabled]="busy()" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [
    FORM_STYLES,
    `
      .muted {
        color: var(--color-text-secondary);
      }
      .actions--start {
        justify-items: start;
      }
      .warning {
        margin-top: 0;
      }
      .warning:focus {
        outline: none;
      }
      ul {
        margin: 0 0 var(--space-4);
        padding-left: var(--space-5, 1.25rem);
        display: grid;
        gap: var(--space-2);
      }
      .danger {
        color: var(--color-danger);
        border-color: var(--color-danger);
      }
      .danger-fill {
        --mdc-filled-button-container-color: var(--color-danger);
        --mat-button-filled-container-color: var(--color-danger);
        --mdc-filled-button-label-text-color: var(--color-surface);
        --mat-button-filled-label-text-color: var(--color-surface);
      }
    `,
  ],
})
export class DeleteAccount {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** All active parent memberships, loaded before deletion can be offered. */
  readonly families = input.required<readonly { name: string; coParentName: string | null }[]>();

  private readonly warning = viewChild<ElementRef<HTMLElement>>('warning');
  private readonly deleteButton = viewChild('deleteButton', { read: ElementRef<HTMLButtonElement> });

  protected readonly form = inject(NonNullableFormBuilder).group({ password: ['', Validators.required] });
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldError = signal<string | null>(null);

  protected start(): void {
    this.open.set(true);
    // Move focus to the explanation, so screen-reader users hear what will happen before the password field.
    afterNextRender(() => this.warning()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancel(): void {
    this.form.reset();
    this.error.set(null);
    this.fieldError.set(null);
    this.open.set(false);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.fieldError.set(null);
    try {
      await this.auth.deleteAccount(this.form.getRawValue().password);
      await this.router.navigate(['/sign-in'], { queryParams: { accountDeleted: 1 } });
    } catch (error) {
      const problem = toProblem(error);
      const passwordErrors = problem.errors['password'];
      if (problem.status === 400 && passwordErrors?.length) {
        this.fieldError.set(passwordErrors.join(' '));
        this.form.controls.password.setErrors({ server: true });
        this.form.markAllAsTouched();
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
