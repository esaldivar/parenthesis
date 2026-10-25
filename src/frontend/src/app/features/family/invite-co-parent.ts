import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, InvitationSummary } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';

/**
 * Invite the co-parent by email (FM-03). The answer is always "Invitation sent", whether or not the address has an
 * account, so this box can't be used to look people up (ADR-0006). Sending again replaces the earlier link.
 */
@Component({
  selector: 'app-invite-co-parent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, Icon],
  template: `
    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }
    <div aria-live="polite">
      @if (status(); as status) {
        <div class="status">{{ status }}</div>
      }
    </div>

    @if (sent(); as sent) {
      <div class="sent">
        <span class="sent__icon"><app-icon name="send" [size]="28" /></span>
        <p class="sent__title">Invitation sent</p>
        <p class="sent__body">
          We sent an invitation to <strong>{{ sent.email }}</strong>. It works once and expires on
          {{ expires(sent.expiresAt) }}.
        </p>
      </div>
      <div class="actions">
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="resend(sent.email)">Resend invitation</button>
        <button mat-button type="button" [disabled]="busy()" (click)="revoke(sent)">Cancel invitation</button>
      </div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="send()" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Co-parent's email</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="off" required />
          <mat-hint>They'll get an email with a link to join. It expires in 7 days.</mat-hint>
          @if (form.controls.email.invalid) {
            <mat-error>{{ fieldError() ?? 'Enter a valid email address.' }}</mat-error>
          }
        </mat-form-field>
        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send invitation' }}</button>
        </div>
      </form>
    }
  `,
  styles: [
    FORM_STYLES,
    `
      .sent {
        display: grid;
        justify-items: center;
        text-align: center;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }
      .sent__icon {
        display: inline-grid;
        place-items: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-surface-soft);
        color: var(--color-text);
      }
      .sent__title {
        font-weight: 600;
        font-size: var(--font-size-h3);
        margin: 0;
      }
      .sent__body {
        color: var(--color-text-secondary);
        margin: 0;
        overflow-wrap: anywhere;
      }
      .sent__body strong {
        color: var(--color-text);
      }
    `,
  ],
})
export class InviteCoParent {
  private readonly api = inject(Api);

  readonly familyId = input.required<string>();
  /** An invitation that's already waiting, so the page opens on "sent" instead of an empty form. */
  readonly pending = input<InvitationSummary | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);
  protected readonly fieldError = signal<string | null>(null);
  private readonly sentNow = signal<InvitationSummary | null | undefined>(undefined);
  /** What was sent here, or else the one already waiting. */
  protected readonly sent = () => (this.sentNow() === undefined ? this.pending() : this.sentNow());

  protected expires(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }

  protected async send(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.invite(this.form.getRawValue().email.trim(), null);
  }

  protected async resend(email: string): Promise<void> {
    await this.invite(email, 'A new invitation is on its way. The earlier link no longer works.');
  }

  protected async revoke(invitation: InvitationSummary): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.api.revokeInvitation(this.familyId(), invitation.id);
      this.sentNow.set(null);
      this.form.reset();
      this.status.set('Invitation cancelled. That link no longer works.');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  private async invite(email: string, statusAfter: string | null): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    this.fieldError.set(null);
    try {
      this.sentNow.set(await this.api.invite(this.familyId(), email));
      this.status.set(statusAfter);
    } catch (error) {
      const problem = toProblem(error);
      const emailErrors = problem.errors['email'];
      if (problem.status === 400 && emailErrors?.length && !this.sent()) {
        this.fieldError.set(emailErrors.join(' '));
        this.form.controls.email.setErrors({ server: true });
        this.form.markAllAsTouched();
      } else {
        this.error.set(generalMessage(problem));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
