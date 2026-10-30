import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { ProfileTile } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { FORM_STYLES } from '../auth/form-styles';

/**
 * "Who's using Parenthesis?" on a registered device (ADR-0006, #153). Names, and each person's own photo or initial
 * (#388): a child's tile shows the photo the child chose, never a parent's personal photo of them. No ages or other
 * family data. A shared device shows only the parent who set it up and the family's approved children; a
 * child's tablet shows only that child. A parent tile asks for that parent's PIN (or password if they have no PIN);
 * a child tile asks for the child's PIN. If the picker can't be loaded, no earlier profile data is shown.
 */
@Component({
  selector: 'app-profile-picker-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, Avatar],
  template: `
    <h1>Who’s using Parenthesis?</h1>
    @if (loadFailed()) {
      <div class="alert" role="alert">{{ error() }}</div>
      <div class="actions">
        <button mat-flat-button type="button" [disabled]="loading()" (click)="load()">
          {{ loading() ? 'Trying again…' : 'Try again' }}
        </button>
      </div>
      <div class="links">
        <a routerLink="/sign-in">Sign in with email and password</a>
      </div>
    } @else if (auth.device(); as device) {
      <p class="lead">{{ device.familyName }}</p>

      <ul class="tiles" aria-label="Profiles">
        @for (tile of device.profiles; track tile.id) {
          <li>
            @if (tile.kind === 'parent' || tile.canSignIn) {
              <a class="tile" [routerLink]="link(tile)">
                <app-avatar [name]="tile.name" [kind]="tile.kind" [size]="72" [src]="tile.photoUrl" />
                <span class="tile__name">{{ tile.name }}</span>
                @if (tile.locked) {
                  <span class="chip">PIN locked</span>
                } @else if (tile.pausedUntil) {
                  <span class="chip">PIN paused</span>
                }
              </a>
            } @else {
              <!-- Not a link: there's nothing to do here until a parent sets a PIN. -->
              <div class="tile tile--off" [attr.aria-describedby]="'off-' + tile.id">
                <app-avatar [name]="tile.name" [size]="72" [src]="tile.photoUrl" />
                <span class="tile__name">{{ tile.name }}</span>
                <span class="tile__note" [id]="'off-' + tile.id">A parent needs to set up a PIN first</span>
              </div>
            }
          </li>
        }
      </ul>

      @if (device.deviceKind === 'Household') {
        <div class="links">
          <a routerLink="/sign-in">Sign in with another account</a>
        </div>
      }
    } @else {
      <!-- Removed, expired after 30 days, or signed out: no picker until a parent sets it up again. -->
      <p class="lead">
        This device isn’t set up for sharing right now. A parent needs to sign in with their email and password and
        set it up again.
      </p>
      <div class="links">
        <a routerLink="/sign-in">Sign in</a>
        <a routerLink="/pair">Pair a child’s tablet</a>
      </div>
    }
  `,
  styles: [
    FORM_STYLES,
    `
      h1 {
        text-align: center;
      }
      .lead {
        text-align: center;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
        gap: var(--space-4);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
        min-height: 9.5rem;
        padding: var(--space-4) var(--space-2);
        border: 1px solid var(--color-divider);
        border-radius: var(--radius-card);
        background: var(--color-surface);
        color: var(--color-text);
        text-align: center;
        text-decoration: none;
      }
      a.tile:hover {
        border-color: var(--color-outline);
      }
      .tile__name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .tile--off {
        color: var(--color-text-secondary);
      }
      .tile__note {
        font-size: 0.875rem;
      }
      .chip {
        padding: 0 var(--space-2);
        border: 1px solid var(--color-outline);
        border-radius: 999px;
        font-size: 0.875rem;
      }
      .links {
        justify-content: center;
      }
      .actions {
        display: grid;
      }
      .actions button {
        min-height: var(--target-min);
      }
    `,
  ],
})
export class ProfilePickerPage implements OnInit {
  protected readonly auth = inject(AuthStore);
  protected readonly error = signal<string | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly loading = signal(false);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.load();
    // A child's own tablet has one profile: go straight to its PIN (owner decision, October 28, 2026).
    const device = this.auth.device();
    const only = device?.deviceKind === 'ChildPaired' && device.profiles.length === 1 ? device.profiles[0] : null;
    if (!this.loadFailed() && only?.kind === 'child' && only.canSignIn) {
      await this.router.navigate(['/profiles', 'child', only.id], { replaceUrl: true });
    }
  }

  /** Refresh, so the picker reflects current permissions and PIN states. On failure, show nothing stale. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.loadDevice();
      this.loadFailed.set(false);
      this.error.set(null);
    } catch (error) {
      this.loadFailed.set(true);
      this.error.set(`We couldn’t load the profiles. ${generalMessage(toProblem(error))}`);
    } finally {
      this.loading.set(false);
    }
  }

  protected link(tile: ProfileTile): string[] {
    return tile.kind === 'parent' && !tile.canSignIn ? ['/profiles', 'parent', tile.id, 'password'] : ['/profiles', tile.kind, tile.id];
  }
}
