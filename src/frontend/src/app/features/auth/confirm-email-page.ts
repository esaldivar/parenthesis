import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { FORM_STYLES } from './form-styles';

type State = 'working' | 'confirmed' | 'invalid' | 'error';

/** Opened from the confirmation email. Reads the one-time token, then removes it from the address bar. */
@Component({
  selector: 'app-confirm-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>Confirm your email</h1>
    <div aria-live="polite">
      @switch (state()) {
        @case ('working') {
          <p class="lead">Confirming…</p>
        }
        @case ('confirmed') {
          <div class="status">Your email is confirmed. You can sign in now.</div>
          <div class="links"><a routerLink="/sign-in">Sign in</a></div>
        }
        @case ('invalid') {
          <div class="alert" role="alert">This link is invalid or has expired.</div>
          <p>Sign in to get a new link, or create your account again.</p>
          <div class="links"><a routerLink="/sign-in">Sign in</a><a routerLink="/register">Create an account</a></div>
        }
        @case ('error') {
          <div class="alert" role="alert">{{ error() }}</div>
        }
      }
    </div>
  `,
  styles: FORM_STYLES,
})
export class ConfirmEmailPage implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly userId = input<string>();
  readonly token = input<string>();

  protected readonly state = signal<State>('working');
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    const userId = this.userId();
    const token = this.token();
    // Keep the one-time token out of browser history.
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });

    if (!userId || !token) {
      this.state.set('invalid');
      return;
    }
    try {
      await this.api.confirmEmail({ userId, token });
      this.state.set('confirmed');
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 400) {
        this.state.set('invalid');
      } else {
        this.error.set(generalMessage(problem));
        this.state.set('error');
      }
    }
  }
}
