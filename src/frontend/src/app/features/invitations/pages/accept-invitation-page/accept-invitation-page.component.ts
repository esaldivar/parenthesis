import { TranslatePipe } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PendingInvitation } from '../../../../core/invitations/pending-invitation';
import { Icon } from '../../../../shared/components/icon/icon';
import { FORM_STYLES } from '../../../auth/form-styles';

type State = 'working' | 'signed-out' | 'joined' | 'invalid' | 'wrong-email' | 'existing-family' | 'error';

const RETURN_URL = '/invitations/accept';

/**
 * Opened from the co-parent invitation email ("Join the family"). The one-time token is moved off the address bar
 * and kept on this device until the invitation is answered, so it survives signing in.
 *
 * Expired, used and cancelled links all get the same calm answer: the API deliberately doesn't say which, so a link
 * can't be used to learn about someone's invitations.
 */
@Component({
  selector: 'app-accept-invitation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, MatButtonModule, Icon],
  template: `
    <div aria-live="polite">
      @switch (state()) {
        @case ('working') {
          <h1>{{ 'feature.join.your.co.parent.s.family' | tr }}</h1>
          <p class="lead">{{ 'feature.checking.your.invitation' | tr }}</p>
        }
        @case ('signed-out') {
          <h1>{{ 'feature.join.your.co.parent.s.family' | tr }}</h1>
          <p class="lead">
            {{ 'feature.sign.in.to.accept.the.invitation.new' | tr }}
          </p>
          <div class="actions">
            <a mat-flat-button [routerLink]="['/sign-in']" [queryParams]="{ returnUrl: returnUrl }">{{ 'feature.sign.in.to.accept' | tr }}</a>
            <a mat-stroked-button routerLink="/register">{{ 'feature.create.your.account' | tr }}</a>
          </div>
        }
        @case ('joined') {
          <div class="state">
            <span class="state__icon"><app-icon name="approvals" [size]="28" /></span>
            <h1>{{ 'feature.you.ve.joined' | tr }} {{ familyName() }}</h1>
            <p class="lead">{{ 'feature.you.and.your.co.parent.now.share' | tr }}</p>
          </div>
          <div class="actions">
            <a mat-flat-button routerLink="/">{{ 'feature.continue' | tr }}</a>
          </div>
        }
        @case ('invalid') {
          <div class="state">
            <span class="state__icon"><app-icon name="link" [size]="28" /></span>
            <h1>{{ 'feature.this.link.isn.t.valid.any.more' | tr }}</h1>
            <p class="lead">
              {{ 'feature.it.may.have.expired.already.been.used' | tr }}
            </p>
          </div>
          <div class="actions">
            <a mat-flat-button [routerLink]="auth.status() === 'signed-in' ? '/' : '/sign-in'">
              {{ auth.status() === 'signed-in' ? ('feature.go.to.parenthesis' | tr) : ('feature.return.to.sign.in' | tr) }}
            </a>
          </div>
        }
        @case ('wrong-email') {
          <h1>{{ 'feature.join.your.co.parent.s.family' | tr }}</h1>
          <div class="alert" role="alert">{{ 'feature.this.invitation.was.sent.to.a.different' | tr }}</div>
          <p>
            {{ 'feature.sign.in.with.the.email.address.the' | tr }}
          </p>
          <div class="actions">
            <button mat-flat-button type="button" (click)="switchAccount()">{{ 'feature.sign.in.with.another.account' | tr }}</button>
            <button mat-button type="button" (click)="notNow()">{{ 'feature.not.now' | tr }}</button>
          </div>
        }
        @case ('existing-family') {
          <h1>{{ 'feature.you.already.have.a.family.on.parenthesis' | tr }}</h1>
          <p class="lead">{{ 'feature.families.are.never.merged.so.nothing.in' | tr }}</p>
          <ul class="choices">
            <li>
              <strong>{{ 'feature.same.children' | tr }}</strong> {{ 'feature.leave.your.current.family.first.then.open' | tr }}
            </li>
            <li>
              <strong>{{ 'feature.a.different.family' | tr }}</strong> {{ 'feature.you.can.join.this.one.as.well' | tr }}
            </li>
          </ul>
          <div class="actions">
            <button mat-flat-button type="button" [disabled]="busy()" (click)="accept(true)">
              {{ busy() ? ('feature.joining' | tr) : ('feature.join.as.a.separate.family' | tr) }}
            </button>
            <button mat-button type="button" (click)="notNow()">{{ 'feature.not.now' | tr }}</button>
          </div>
        }
        @case ('error') {
          <h1>{{ 'feature.join.your.co.parent.s.family' | tr }}</h1>
          <div class="alert" role="alert">{{ error() }}</div>
          <div class="actions">
            @if (canRetry()) {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="accept(false)">{{ 'feature.try.again' | tr }}</button>
            } @else {
              <a mat-flat-button routerLink="/">{{ 'feature.go.to.parenthesis' | tr }}</a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    FORM_STYLES,
    `
      .state {
        display: grid;
        justify-items: center;
        text-align: center;
      }
      .state__icon {
        display: inline-grid;
        place-items: center;
        width: 56px;
        height: 56px;
        margin-bottom: var(--space-4);
        border-radius: 50%;
        background: var(--color-surface-soft);
        color: var(--color-text);
      }
      .choices {
        display: grid;
        gap: var(--space-3);
        padding-left: var(--space-6);
        margin-bottom: var(--space-6);
      }
      .actions a {
        min-height: var(--target-min);
      }
    `,
  ],
})
export class AcceptInvitationPage implements OnInit {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingInvitation);

  readonly token = input<string>();

  protected readonly returnUrl = RETURN_URL;
  protected readonly state = signal<State>('working');
  protected readonly familyName = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly canRetry = signal(true);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const fromLink = this.token();
    if (fromLink) {
      this.pending.save(fromLink);
      // Keep the one-time token out of browser history.
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    if (!this.pending.peek()) {
      this.state.set('invalid');
    } else if (this.auth.status() !== 'signed-in') {
      this.state.set('signed-out');
    } else {
      await this.accept(false);
    }
  }

  protected async accept(confirmSeparateFamily: boolean): Promise<void> {
    const token = this.pending.peek();
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.busy.set(true);
    try {
      const family = await this.api.acceptInvitation(token, confirmSeparateFamily);
      this.pending.clear();
      this.familyName.set(family.name);
      await this.auth.loadFamilies().catch(() => undefined);
      this.state.set('joined');
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 404) {
        this.pending.clear();
        this.state.set('invalid');
      } else if (problem.status === 403) {
        this.state.set('wrong-email');
      } else if (problem.status === 409 && problem.type?.endsWith('/existing-family')) {
        this.state.set('existing-family');
      } else {
        if (problem.status === 409) {
          // Already a member, or the family is full: this link has nothing more to do.
          this.pending.clear();
        }
        this.canRetry.set(problem.status !== 409);
        this.error.set(generalMessage(problem));
        this.state.set('error');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Leave the invitation for now. It stays on this device, but the app stops bringing the parent back to it until a
   * reload, so home is home for a parent with a family, and new-family setup for one without (#211).
   */
  protected async notNow(): Promise<void> {
    this.pending.defer();
    await this.router.navigateByUrl('/');
  }

  protected async switchAccount(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: RETURN_URL } });
  }
}
