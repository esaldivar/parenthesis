import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EventThemesService } from '../../core/theme/event-themes.service';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Api, FamilyDetails, InvitationSummary } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';
import { ChildrenAccess } from '../family/children-access';
import { DeviceList } from '../family/device-list';
import { ParentPinSettings } from '../family/parent-pin-settings';
import { InviteCoParent } from '../family/invite-co-parent';
import { DeleteAccount } from './delete-account';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSlideToggleModule, AppearancePicker, InviteCoParent, ChildrenAccess, DeviceList, ParentPinSettings, DeleteAccount],
  template: `
    <h1>Settings</h1>
    <section class="card">
      <app-appearance-picker />
      <mat-slide-toggle [checked]="eventThemes.enabled()" (change)="eventThemes.setEnabled($event.checked)" aria-describedby="event-theme-help">Add themes to events</mat-slide-toggle>
      <p id="event-theme-help">Show subtle illustrations when an event title matches a theme. This changes only your view on this device.</p>
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

        <section class="card" aria-labelledby="children-heading">
          <h2 id="children-heading">Children</h2>
          <app-children-access [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="parent-pin-heading">
          <h2 id="parent-pin-heading">Your parent PIN</h2>
          <app-parent-pin-settings [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="devices-heading">
          <h2 id="devices-heading">Devices</h2>
          <app-device-list [familyId]="current.id" />
        </section>
      }
    }

    @if (auth.status() === 'signed-in') {
      <section class="card" aria-labelledby="delete-account-heading">
        <h2 id="delete-account-heading">Delete account</h2>
        @if (deletionError(); as message) {
          <p role="alert">{{ message }}</p>
        } @else if (deletionFamilies(); as families) {
          <app-delete-account [families]="families" />
        } @else {
          <p class="muted">Loading account deletion details…</p>
        }
      </section>
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
      border: 1px solid var(--color-divider);
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
  protected readonly eventThemes = inject(EventThemesService);
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(Api);

  protected readonly details = signal<FamilyDetails | null>(null);
  protected readonly pending = signal<InvitationSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly deletionError = signal<string | null>(null);
  protected readonly deletionFamilies = signal<readonly { name: string; coParentName: string | null }[] | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadDeletionFamilies(), this.loadCurrentFamily()]);
  }

  private async loadDeletionFamilies(): Promise<void> {
    // The deletion endpoint affects every active family, not just the selected one.
    // Never show a destructive confirmation based on partial or failed loads.
    try {
      const summaries = await this.api.myFamilies();
      const parentFamilies = summaries.filter((family) => family.role === 'Parent');
      const allDetails = await Promise.all(parentFamilies.map((family) => this.api.family(family.id)));
      this.deletionFamilies.set(allDetails.map((details) => ({ name: details.name, coParentName: this.coParent(details) })));
    } catch (error) {
      this.deletionError.set(generalMessage(toProblem(error)));
    }
  }

  private async loadCurrentFamily(): Promise<void> {
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
