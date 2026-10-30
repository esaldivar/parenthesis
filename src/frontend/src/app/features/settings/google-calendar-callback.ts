import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Api } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Toasts } from '../../shared/toast/toasts';

/**
 * Where Google sends a parent back after its consent page (#386). Finishes connecting with the one-time code, then
 * returns to Settings. The code leaves the address bar straight away, so it isn't kept in history.
 */
@Component({
  selector: 'app-google-calendar-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule],
  template: `
    <h1>Google Calendar</h1>
    <section class="card">
      @if (message(); as message) {
        <p role="alert">{{ message }}</p>
        <a mat-stroked-button routerLink="/settings">Back to Settings</a>
      } @else {
        <p role="status">Connecting Google Calendar…</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }
    .card {
      display: grid;
      gap: var(--space-3);
      justify-items: start;
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
    }
    p {
      margin: 0;
    }
    a {
      min-height: var(--target-min);
    }
  `,
})
export class GoogleCalendarCallback implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly route = inject(ActivatedRoute);

  protected readonly message = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const [code, state, denied] = [params.get('code'), params.get('state'), params.get('error')];
    // Drop the code from the address bar and history before anything else.
    await this.router.navigate([], { queryParams: {}, replaceUrl: true });

    const family = this.auth.currentFamily();
    if (denied || !code || !state) {
      this.message.set(
        denied === 'access_denied'
          ? 'Google Calendar wasn’t connected, because access wasn’t allowed on Google’s page.'
          : 'Google Calendar wasn’t connected. Start again from Settings.',
      );
      return;
    }
    if (family?.role !== 'Parent') {
      this.message.set('Only a parent can connect Google Calendar. Start again from Settings.');
      return;
    }

    try {
      const status = await this.api.googleCalendarConnect(family.id, code, state);
      this.toasts.show(
        `Google Calendar is connected. Events will appear in “${status.calendarName}” in a minute or two.`,
      );
      await this.router.navigateByUrl('/settings', { replaceUrl: true });
    } catch (error) {
      const problem = toProblem(error);
      this.message.set(
        Object.values(problem.errors).flat()[0] ?? problem.detail ?? generalMessage(problem),
      );
    }
  }
}
