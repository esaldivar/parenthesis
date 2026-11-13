import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { PARENT_PIN_PATTERN, isTrivialPin } from './pin-rules';

/** Where the link's token waits, in this tab only, while the parent signs in. */
export const RESET_TOKEN_KEY = 'parenthesis.parentPinReset';

function notTrivial(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && isTrivialPin(control.value) ? { trivial: true } : null;
}

type Step = 'checking' | 'sign-in' | 'form' | 'saved' | 'unusable' | 'wrong-account';

/**
 * The parent PIN reset link (#153; owner decision October 28, 2026): single use, 15 minutes, and never enough on its
 * own. The parent the link was sent to signs in with their email and password, confirms the password, and chooses a
 * new six-digit PIN. The token leaves the address bar at once (kept for this tab only), so it isn't left in history.
 * Expired, used and unknown links all get the same message.
 */
@Component({
  selector: 'app-parent-pin-reset-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h1>{{ 'feature.choose.a.new.parent.pin' | tr }}</h1>

    @switch (step()) {
      @case ('checking') {
        <p class="lead" role="status">{{ 'feature.checking.your.link' | tr }}</p>
      }
      @case ('sign-in') {
        <p class="lead">{{ 'feature.sign.in.with.the.email.and.password' | tr }}</p>
        <div class="links">
          <a routerLink="/sign-in" [queryParams]="{ returnUrl: '/parent-pin/reset' }">{{ 'feature.sign.in' | tr }}</a>
          <a routerLink="/forgot-password">{{ 'feature.forgot.your.password' | tr }}</a>
        </div>
      }
      @case ('unusable') {
        <div class="alert" role="alert">
          {{ 'feature.this.reset.link.has.expired.or.was' | tr }}
        </div>
        <div class="links">
          <a routerLink="/">{{ 'feature.go.to.parenthesis' | tr }}</a>
        </div>
      }
      @case ('wrong-account') {
        <div class="alert" role="alert">{{ 'feature.use.the.parent.account.this.reset.link' | tr }}</div>
        <div class="actions">
          <button mat-stroked-button type="button" (click)="switchAccount()">{{ 'feature.switch.account' | tr }}</button>
        </div>
        <div class="links">
          <a routerLink="/">{{ 'feature.cancel' | tr }}</a>
        </div>
      }
      @case ('saved') {
        <div class="status" role="status">{{ 'feature.your.new.parent.pin.works.now.any' | tr }}</div>
        <div class="links">
          <a routerLink="/">{{ 'feature.continue' | tr }}</a>
        </div>
      }
      @case ('form') {
        @if (error(); as error) {
          <div class="alert" role="alert">{{ error }}</div>
        }
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.your.account.password' | tr }}</mat-label>
            <input matInput type="password" autocomplete="current-password" formControlName="currentPassword" required />
            @if (form.controls.currentPassword.hasError('wrong')) {
              <mat-error>{{ 'feature.that.password.isn.t.right' | tr }}</mat-error>
            } @else if (form.controls.currentPassword.invalid) {
              <mat-error>{{ 'feature.enter.your.password.to.confirm.it.s' | tr }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.new.parent.pin' | tr }}</mat-label>
            <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="pin" required />
            <mat-hint>{{ 'feature.6.numbers.not.all.the.same.or' | tr }}</mat-hint>
            @if (form.controls.pin.hasError('required')) {
              <mat-error>{{ 'feature.choose.a.six.digit.pin' | tr }}</mat-error>
            } @else if (form.controls.pin.hasError('pattern')) {
              <mat-error>{{ 'feature.your.parent.pin.is.6.numbers' | tr }}</mat-error>
            } @else if (form.controls.pin.hasError('trivial')) {
              <mat-error>{{ 'feature.choose.numbers.that.aren.t.all.the.769c2b' | tr }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.type.the.new.pin.again' | tr }}</mat-label>
            <input matInput type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" formControlName="confirm" required />
            @if (form.controls.confirm.invalid) {
              <mat-error>{{ 'feature.the.two.pins.don.t.match' | tr }}</mat-error>
            }
          </mat-form-field>
          <div class="actions">
            <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? ('feature.saving' | tr) : ('feature.save.pin' | tr) }}</button>
          </div>
        </form>
      }
    }
  `,
  styles: FORM_STYLES,
})
export class ParentPinResetPage implements OnInit {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** The link's token, from the query string. Moved out of the address bar straight away. */
  readonly token = input<string>();

  protected readonly step = signal<Step>('checking');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private familyId: string | null = null;

  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    pin: ['', [Validators.required, Validators.pattern(PARENT_PIN_PATTERN), notTrivial]],
    confirm: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const fromLink = this.token();
    if (fromLink) {
      store(fromLink);
      await this.router.navigate(['/parent-pin/reset'], { replaceUrl: true });
    }
    const token = stored();
    if (!token) {
      this.step.set('unusable');
      return;
    }
    if (this.auth.status() !== 'signed-in') {
      this.step.set('sign-in');
      return;
    }
    const families = await this.auth.loadFamilies().catch(() => []);
    this.familyId = families.find((f) => f.role === 'Parent')?.id ?? null;
    if (!this.familyId) {
      this.step.set('wrong-account');
      return;
    }
    try {
      await this.api.checkParentPinReset(this.familyId, token);
      this.step.set('form');
    } catch (error) {
      this.showProblem(toProblem(error).status, error);
    }
  }

  protected async switchAccount(): Promise<void> {
    await this.auth.switchProfile();
    this.step.set('sign-in');
  }

  protected async save(): Promise<void> {
    const { currentPassword, pin, confirm } = this.form.getRawValue();
    if (pin !== confirm) {
      this.form.controls.confirm.setErrors({ mismatch: true });
    }
    const token = stored();
    if (this.form.invalid || !token || !this.familyId) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.redeemParentPinReset(this.familyId, token, currentPassword, pin);
      clear();
      this.step.set('saved');
      await this.auth.loadDevice().catch(() => undefined);
    } catch (error) {
      const problem = toProblem(error);
      if (problem.errors['currentPassword']) {
        this.form.controls.currentPassword.setErrors({ wrong: true });
        this.form.controls.currentPassword.markAsTouched();
      } else if (problem.errors['pin']) {
        this.error.set(problem.errors['pin'].join(' '));
      } else {
        this.showProblem(problem.status, error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private showProblem(status: number, error: unknown): void {
    if (status === 410) {
      clear();
      this.step.set('unusable');
    } else if (status === 403) {
      this.step.set('wrong-account');
    } else {
      // Never claim the PIN was saved when the result is uncertain.
      this.step.set('form');
      this.error.set(translate('profile.pin.saveError', this.copyLocale.locale(), { reason: generalMessage(toProblem(error)) }));
    }
  }
}

/**
 * In-memory copy of the token for this page load, so the link still works when session storage is blocked (private
 * mode, strict settings): the parent can finish if they're already signed in. Signing in first needs storage, since
 * that leaves the page.
 */
let memoryToken: string | null = null;

function store(token: string): void {
  memoryToken = token;
  try {
    sessionStorage.setItem(RESET_TOKEN_KEY, token);
  } catch {
    // The in-memory copy is enough while the parent stays on this page.
  }
}

function stored(): string | null {
  try {
    return sessionStorage.getItem(RESET_TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function clear(): void {
  memoryToken = null;
  try {
    sessionStorage.removeItem(RESET_TOKEN_KEY);
  } catch {
    // Nothing else to clear.
  }
}
