import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Api, FamilyDetails, InvitationSummary } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';
import { InviteCoParent } from '../family/invite-co-parent';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearancePicker, InviteCoParent],
  template: `
    <h1>Settings</h1>
    <section class="card">
      <app-appearance-picker />
    </section>

    @if (auth.currentFamily(); as current) {
      @if (current.role === 'Parent') {
        <section class="card" aria-labelledby="co-parent-heading">
          <h2 id="co-parent-heading">Co-parent</h2>
          @if (error(); as error) {
            <p role="alert">{{ error }}</p>
          } @else if (details(); as details) {
            @if (coParent(details); as coParent) {
              <p>You share {{ details.name }} with <strong>{{ coParent }}</strong>. You both have the same say.</p>
            } @else {
              <p class="muted">Invite your co-parent so you can make decisions together.</p>
              <app-invite-co-parent [familyId]="current.id" [pending]="pending()" />
            }
          } @else {
            <p class="muted">Loading…</p>
          }
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }
    .card {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
    h2 {
      font-size: var(--font-size-h3);
      margin-top: 0;
    }
    .muted {
      color: var(--color-text-secondary);
    }
  `,
})
export class SettingsPage implements OnInit {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(Api);

  protected readonly details = signal<FamilyDetails | null>(null);
  protected readonly pending = signal<InvitationSummary | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const family = this.auth.currentFamily();
    if (family?.role !== 'Parent') {
      return;
    }
    try {
      const [details, invitations] = await Promise.all([this.api.family(family.id), this.api.invitations(family.id)]);
      this.pending.set(invitations.at(-1) ?? null);
      this.details.set(details);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  /** The other parent's name, once they've joined. */
  protected coParent(details: FamilyDetails): string | null {
    const me = this.auth.user()?.displayName;
    const parents = details.members.filter((m) => m.role === 'Parent');
    return parents.length > 1 ? (parents.find((p) => p.displayName !== me) ?? parents[1]).displayName : null;
  }
}
