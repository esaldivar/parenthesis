import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { Api, Child } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { PIN_PATTERN } from '../profiles/child-pin-page';

/** Mirrors the API's rule (ChildCredential.IsAcceptable): not all the same digit, and not a straight run like 1234. */
export function isGuessablePin(pin: string): boolean {
  const steps = new Set([...pin].slice(1).map((digit, i) => Number(digit) - Number(pin[i])));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]);
}

function pinRules(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  return PIN_PATTERN.test(value) && isGuessablePin(value) ? { guessable: true } : null;
}

interface Panel {
  readonly childId: string;
  readonly kind: 'pin' | 'disable' | 'pair';
}

/**
 * Children's sign-in, for parents (ADR-0006): set a first PIN, propose a new one (the co-parent approves it), unlock
 * after three wrong tries, turn sign-in off, and pair a child's own tablet. Unlocking and turning sign-in off are
 * protective, so they apply at once without approval.
 */
@Component({
  selector: 'app-children-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, Avatar],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }
    @if (notice(); as notice) {
      <p class="notice" role="status">{{ notice }}</p>
    }

    @if (children(); as children) {
      @if (children.length === 0) {
        <p class="muted">No children yet.</p>
      } @else {
        <ul class="children">
          @for (child of children; track child.id) {
            <li class="child">
              <div class="child__head">
                <app-avatar [name]="child.firstName" [size]="40" />
                <div>
                  <p class="child__name">{{ child.firstName }}</p>
                  <p class="child__state">{{ state(child) }}</p>
                </div>
              </div>

              @if (child.status === 'Active') {
                <div class="child__actions">
                  @if (child.signIn.locked) {
                    <button mat-flat-button type="button" [disabled]="busy()" (click)="unlock(child)">Unlock</button>
                  }
                  @if (!child.signIn.pinChangePending) {
                    <button mat-stroked-button type="button" (click)="open(child, 'pin')">
                      {{ child.signIn.enabled ? 'Change PIN' : 'Set a PIN' }}
                    </button>
                  }
                  @if (child.signIn.enabled) {
                    <button mat-stroked-button type="button" (click)="open(child, 'pair')">Pair a tablet</button>
                    <button mat-button type="button" (click)="open(child, 'disable')">Turn off sign-in</button>
                  }
                </div>

                @if (isOpen(child, 'pin')) {
                  <form class="panel" [formGroup]="pinForm" (ngSubmit)="savePin(child)" novalidate>
                    <p class="muted">
                      @if (child.signIn.enabled) {
                        Your co-parent approves a new PIN. {{ child.firstName }}’s current PIN keeps working until then.
                      } @else {
                        {{ child.firstName }} uses this PIN on your family’s devices.
                      }
                    </p>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>New PIN for {{ child.firstName }}</mat-label>
                      <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="pin" required />
                      <mat-hint>4 to 6 numbers</mat-hint>
                      @if (pinForm.controls.pin.hasError('required')) {
                        <mat-error>Enter a PIN.</mat-error>
                      } @else if (pinForm.controls.pin.hasError('pattern')) {
                        <mat-error>Use 4 to 6 numbers.</mat-error>
                      } @else if (pinForm.controls.pin.hasError('guessable')) {
                        <mat-error>Choose numbers that aren’t all the same or in a simple run like 1234.</mat-error>
                      }
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Type it again</mat-label>
                      <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="confirm" required />
                      @if (pinForm.controls.confirm.hasError('required')) {
                        <mat-error>Type the PIN again.</mat-error>
                      } @else if (pinForm.controls.confirm.hasError('mismatch')) {
                        <mat-error>The two PINs don’t match.</mat-error>
                      }
                    </mat-form-field>
                    <div class="panel__actions">
                      <button mat-flat-button type="submit" [disabled]="busy()">
                        {{ child.signIn.enabled ? 'Ask your co-parent' : 'Save PIN' }}
                      </button>
                      <button mat-button type="button" (click)="close()">Cancel</button>
                    </div>
                  </form>
                }

                @if (isOpen(child, 'disable')) {
                  <div class="panel">
                    <p>
                      {{ child.firstName }} won’t be able to sign in until a parent sets a new PIN, and anyone signed in as
                      {{ child.firstName }} is signed out now. This doesn’t need your co-parent’s approval.
                    </p>
                    <div class="panel__actions">
                      <button mat-flat-button type="button" [disabled]="busy()" (click)="disable(child)">Turn off sign-in</button>
                      <button mat-button type="button" (click)="close()">Cancel</button>
                    </div>
                  </div>
                }

                @if (isOpen(child, 'pair')) {
                  <div class="panel">
                    @if (pairing(); as pairing) {
                      @if (minutesLeft() > 0) {
                        <p>On {{ child.firstName }}’s tablet, go to <strong>{{ pairUrl }}</strong> and enter this code:</p>
                        <p class="code" [attr.aria-label]="spelled(pairing.code)">{{ pairing.code }}</p>
                        <p class="muted" aria-live="polite">
                          Works once, for {{ minutesLeft() === 1 ? 'about 1 more minute' : 'about ' + minutesLeft() + ' more minutes' }}.
                        </p>
                      } @else {
                        <p role="status">This code has expired. Get a new one when the tablet is ready.</p>
                      }
                    } @else {
                      <p class="muted">You’ll get a code that works once, for 10 minutes. Only {{ child.firstName }} can use the tablet you pair.</p>
                    }
                    <div class="panel__actions">
                      <button mat-flat-button type="button" [disabled]="busy()" (click)="pair(child)">
                        {{ pairing() ? 'Get a new code' : 'Get a code' }}
                      </button>
                      <button mat-button type="button" (click)="close()">Done</button>
                    </div>
                  </div>
                }
              }
            </li>
          }
        </ul>
        @if (hasActive()) {
          <p class="preview"><a routerLink="/kid">Preview the children’s space</a></p>
        }
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    .children {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .child {
      display: grid;
      gap: var(--space-3);
    }
    .child + .child {
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-surface-soft);
    }
    .child__head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .child__name {
      margin: 0;
      font-weight: 600;
    }
    .child__state {
      margin: 0;
      color: var(--color-text-secondary);
    }
    .child__actions,
    .panel__actions {
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
    .panel p {
      margin: 0;
    }
    mat-form-field {
      width: 100%;
    }
    .code {
      font-size: var(--font-size-h2);
      font-weight: 700;
      letter-spacing: 0.08em;
      font-variant-numeric: tabular-nums;
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
    .notice {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      background: var(--color-status-confirmed-bg);
    }
    .preview a {
      display: inline-flex;
      align-items: center;
      min-height: var(--target-min);
    }
  `,
})
export class ChildrenAccess implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly familyId = input.required<string>();

  protected readonly pairUrl = `${location.host}/pair`;
  protected readonly children = signal<readonly Child[] | null>(null);
  protected readonly panel = signal<Panel | null>(null);
  protected readonly pairing = signal<{ code: string; expiresAt: string } | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly hasActive = computed(() => (this.children() ?? []).some((c) => c.status === 'Active'));

  private readonly now = signal(Date.now());
  protected readonly minutesLeft = computed(() => {
    const pairing = this.pairing();
    return pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - this.now()) / 60_000)) : 0;
  });

  protected readonly pinForm = this.fb.group(
    {
      pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN), pinRules]],
      confirm: ['', Validators.required],
    },
    {
      validators: (group: AbstractControl) => {
        const confirm = group.get('confirm');
        const mismatch = !!confirm?.value && confirm.value !== group.get('pin')?.value;
        // Keep the error on the second field, so it shows there.
        confirm?.setErrors(mismatch ? { ...confirm.errors, mismatch: true } : confirm.errors && omit(confirm.errors, 'mismatch'));
        return null;
      },
    },
  );

  constructor() {
    // The pairing countdown moves once every 15 seconds; minutes are all it shows.
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected state(child: Child): string {
    if (child.status === 'PendingApproval') {
      return 'Waiting for approval';
    }
    if (child.signIn.locked) {
      return 'Locked after 3 wrong PINs';
    }
    if (child.signIn.pinChangePending) {
      return 'New PIN waiting for your co-parent’s approval';
    }
    return child.signIn.enabled ? 'Signs in with a PIN' : 'No PIN yet, so can’t sign in';
  }

  protected isOpen(child: Child, kind: Panel['kind']): boolean {
    const panel = this.panel();
    return panel?.childId === child.id && panel.kind === kind;
  }

  protected open(child: Child, kind: Panel['kind']): void {
    this.pinForm.reset();
    this.pairing.set(null);
    this.notice.set(null);
    this.error.set(null);
    this.panel.set({ childId: child.id, kind });
  }

  protected close(): void {
    this.panel.set(null);
    this.pairing.set(null);
  }

  protected async savePin(child: Child): Promise<void> {
    if (this.pinForm.invalid) {
      this.pinForm.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      const proposed = await this.api.setChildPin(this.familyId(), child.id, this.pinForm.getRawValue().pin);
      this.close();
      this.notice.set(
        proposed
          ? `We’ve asked your co-parent to approve ${child.firstName}’s new PIN. The current PIN works until then.`
          : `${child.firstName} can now sign in with their PIN.`,
      );
    });
  }

  protected async unlock(child: Child): Promise<void> {
    await this.run(async () => {
      await this.api.unlockChild(this.familyId(), child.id);
      this.notice.set(`${child.firstName}’s profile is unlocked.`);
    });
  }

  protected async disable(child: Child): Promise<void> {
    await this.run(async () => {
      await this.api.disableChildSignIn(this.familyId(), child.id);
      this.close();
      this.notice.set(`${child.firstName}’s sign-in is turned off.`);
    });
  }

  protected async pair(child: Child): Promise<void> {
    await this.run(async () => {
      this.pairing.set(await this.api.pairingCode(this.familyId(), child.id));
      this.now.set(Date.now());
    }, false);
  }

  /** Reads the code out character by character ("A B C D, 2 3 4 5"). */
  protected spelled(code: string): string {
    return code.split('-').map((part) => part.split('').join(' ')).join(', ');
  }

  private async run(action: () => Promise<void>, reload = true): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      if (reload) {
        await this.reload();
        // The picker on this device shows locks and PINs too.
        await this.auth.loadDevice().catch(() => undefined);
      }
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(problem.errors['pin']?.join(' ') ?? generalMessage(problem));
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.children.set(await this.api.children(this.familyId()));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }
}

function omit(errors: ValidationErrors, key: string): ValidationErrors | null {
  const rest = Object.fromEntries(Object.entries(errors).filter(([name]) => name !== key));
  return Object.keys(rest).length ? rest : null;
}
