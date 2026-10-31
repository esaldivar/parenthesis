import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { KidPresentation, KidPresentationService } from '../../layout/kid-shell/kid-presentation.service';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';
import { PhotoEditor } from '../../shared/photo-editor/photo-editor';

@Component({
  selector: 'app-kid-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearancePicker, MatRadioModule, MatButtonModule, PhotoEditor, RouterLink],
  template: `
    <h1>Settings</h1>

    <section class="card">
      <app-appearance-picker />
    </section>

    @if (auth.child(); as child) {
      <section class="card" aria-labelledby="photo-heading">
        <h2 id="photo-heading">Your picture</h2>
        <app-photo-editor
          [familyId]="child.familyId"
          [subject]="{ kind: 'child', id: child.childId }"
          [name]="child.firstName"
          [label]="child.firstName"
          hint="It shows when you pick your name to sign in."
        />
      </section>
    }

    <section class="card">
      <h2 id="size-heading">How things look</h2>
      <p id="size-help" class="help">Pick what feels easiest to read and tap. You can change it any time.</p>
      <mat-radio-group
        class="options"
        aria-labelledby="size-heading"
        aria-describedby="size-help"
        [value]="presentation.presentation()"
        (change)="choose($event)"
      >
        <mat-radio-button value="simple">Bigger and simpler</mat-radio-button>
        <mat-radio-button value="balanced">Balanced</mat-radio-button>
        <mat-radio-button value="compact">Compact</mat-radio-button>
      </mat-radio-group>
    </section>

    @if (auth.status() === 'child') {
      <section class="card">
        <h2>Done for now?</h2>
        <p class="help">Go back to the list of profiles so someone else can use this device.</p>
        <button mat-stroked-button type="button" (click)="switchProfile()">Switch profile</button>
      </section>
    }

    <p class="privacy"><a routerLink="/privacy">Privacy</a></p>
  `,
  styles: `
    .card {
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
    }
    .help {
      color: var(--color-text-secondary);
    }
    button {
      min-height: var(--kid-target, var(--target-min));
    }
    .privacy a {
      display: inline-flex;
      min-height: var(--kid-target, var(--target-min));
      align-items: center;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-6);
    }
  `,
})
export class KidSettingsPage {
  protected readonly presentation = inject(KidPresentationService);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Ends the child's session. Getting into a parent profile from here always takes that parent's password. */
  /** Ends this session and keeps the device's picker; Back can't return to the child's pages (#153). */
  protected async switchProfile(): Promise<void> {
    await this.auth.switchProfile();
    await this.router.navigateByUrl(this.auth.device() ? '/profiles' : '/sign-in', { replaceUrl: true });
  }

  protected choose(event: MatRadioChange<KidPresentation>): void {
    this.presentation.presentation.set(event.value);
  }
}
