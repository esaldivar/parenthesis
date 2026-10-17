import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { KidPresentation, KidPresentationService } from '../../layout/kid-shell/kid-presentation.service';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';

@Component({
  selector: 'app-kid-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearancePicker, MatRadioModule],
  template: `
    <h1>Settings</h1>

    <section class="card">
      <app-appearance-picker />
    </section>

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
  `,
  styles: `
    .card {
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
    .help {
      color: var(--color-text-secondary);
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

  protected choose(event: MatRadioChange<KidPresentation>): void {
    this.presentation.presentation.set(event.value);
  }
}
