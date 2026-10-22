import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { PendingInvitation } from '../../core/invitations/pending-invitation';
import { Icon } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';

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
  imports: [RouterLink, MatButtonModule, Icon],
  template: `
    <div aria-live="polite">
      @switch (state()) {
        @case ('working') {
          <h1>Join your co-parent's family</h1>
          <p class="lead">Checking your invitation…</p>
        }
        @case ('signed-out') {
          <h1>Join your co-parent's family</h1>
          <p class="lead">
            Sign in to accept the invitation. New to Parenthesis? Create an account with the email address the
            invitation was sent to.
          </p>
          <div class="actions">
            <a mat-flat-button [routerLink]="['/sign-in']" [queryParams]="{ returnUrl: returnUrl }">Sign in to accept</a>
            <a mat-stroked-button routerLink="/register">Create your account</a>
          </div>
        }
        @case ('joined') {
          <div class="state">
            <span class="state__icon"><app-icon name="approvals" [size]="28" /></span>
            <h1>You've joined {{ familyName() }}</h1>
            <p class="lead">You and your co-parent now share this family, with the same say in every decision.</p>
          </div>
          <div class="actions">
            <a mat-flat-button routerLink="/">Continue</a>
          </div>
        }
        @case ('invalid') {
          <div class="state">
            <span class="state__icon"><app-icon name="link" [size]="28" /></span>
            <h1>This link isn't valid any more</h1>
            <p class="lead">
              It may have expired, already been used, or been cancelled. Ask your co-parent to send you a new invitation.
            </p>
          </div>
          <div class="actions">
            <a mat-flat-button [routerLink]="auth.status() === 'signed-in' ? '/' : '/sign-in'">
              {{ auth.status() === 'signed-in' ? 'Go to Parenthesis' : 'Return to sign in' }}
            </a>
          </div>
        }
        @case ('wrong-email') {
          <h1>Join your co-parent's family</h1>
          <div class="alert" role="alert">This invitation was sent to a different email address.</div>
          <p>
            Sign in with the email address the invitation was sent to, or create an account with it. This device keeps
            the invitation until then.
          </p>
          <div class="actions">
            <button mat-flat-button type="button" (click)="switchAccount()">Sign in with another account</button>
            <button mat-button type="button" (click)="notNow()">Not now</button>
          </div>
        }
        @case ('existing-family') {
          <h1>You already have a family on Parenthesis</h1>
          <p class="lead">Families are never merged, so nothing in your current family will change.</p>
          <ul class="choices">
            <li>
              <strong>Same children?</strong> Leave your current family first, then open this link again. That keeps
              each child's history in one place.
            </li>
            <li>
              <strong>A different family?</strong> You can join this one as well. The two families stay completely
              separate.
            </li>
          </ul>
          <div class="actions">
            <button mat-flat-button type="button" [disabled]="busy()" (click)="accept(true)">
              {{ busy() ? 'Joining…' : 'Join as a separate family' }}
            </button>
            <button mat-button type="button" (click)="notNow()">Not now</button>
          </div>
        }
        @case ('error') {
          <h1>Join your co-parent's family</h1>
          <div class="alert" role="alert">{{ error() }}</div>
          <div class="actions">
            @if (canRetry()) {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="accept(false)">Try again</button>
            } @else {
              <a mat-flat-button routerLink="/">Go to Parenthesis</a>
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

  async ngOnInit(): Promise<void> {
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
