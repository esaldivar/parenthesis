import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfileTile } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { FORM_STYLES } from '../auth/form-styles';

/**
 * "Who's using Parenthesis?" on a registered device (ADR-0006). Names and initials only: no ages, photos or other
 * family data. A parent tile asks for that parent's full password; a child tile asks for the child's PIN.
 */
@Component({
  selector: 'app-profile-picker-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar],
  template: `
    <h1>Who’s using Parenthesis?</h1>
    @if (auth.device(); as device) {
      <p class="lead">{{ device.familyName }}</p>

      @if (error(); as error) {
        <div class="alert" role="alert">{{ error }}</div>
      }

      <ul class="tiles" aria-label="Profiles">
        @for (tile of device.profiles; track tile.id) {
          <li>
            @if (tile.kind === 'parent' || tile.canSignIn) {
              <a class="tile" [routerLink]="link(tile)">
                <app-avatar [name]="tile.name" [kind]="tile.kind" [size]="72" />
                <span class="tile__name">{{ tile.name }}</span>
                @if (tile.locked) {
                  <span class="chip">Locked</span>
                }
              </a>
            } @else {
              <!-- Not a link: there's nothing to do here until a parent sets a PIN. -->
              <div class="tile tile--off" [attr.aria-describedby]="'off-' + tile.id">
                <app-avatar [name]="tile.name" [size]="72" />
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
      <!-- A parent removed this device, so it no longer has a picker. -->
      <p class="lead">This device isn’t set up for your family any more.</p>
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
        border: 1px solid var(--color-surface-soft);
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
    `,
  ],
})
export class ProfilePickerPage implements OnInit {
  protected readonly auth = inject(AuthStore);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    // Refresh, so a profile a parent just unlocked or set up shows its current state.
    try {
      await this.auth.loadDevice();
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  protected link(tile: ProfileTile): string[] {
    return ['/profiles', tile.kind, tile.id];
  }
}
