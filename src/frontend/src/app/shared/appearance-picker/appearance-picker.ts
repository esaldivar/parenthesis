import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { AppearancePreference, AppearanceService } from '../../core/theme/appearance.service';

interface AppearanceOption {
  readonly value: AppearancePreference;
  readonly label: string;
}

/** Labelled, keyboard-operable radio group for each person's own Light / Dark / System choice. */
@Component({
  selector: 'app-appearance-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatRadioModule],
  template: `
    <h2 id="appearance-heading">Appearance</h2>
    <p id="appearance-help" class="help">
      This only changes how Parenthesis looks for you. System follows your device's light or dark setting.
    </p>
    <mat-radio-group
      class="options"
      aria-labelledby="appearance-heading"
      aria-describedby="appearance-help"
      [value]="appearance.preference()"
      (change)="choose($event)"
    >
      @for (option of options; track option.value) {
        <mat-radio-button [value]="option.value">{{ option.label }}</mat-radio-button>
      }
    </mat-radio-group>
  `,
  styles: `
    .help {
      color: var(--color-text-secondary);
      max-width: 40rem;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-6);
    }
  `,
})
export class AppearancePicker {
  protected readonly appearance = inject(AppearanceService);
  protected readonly options: readonly AppearanceOption[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  protected choose(event: MatRadioChange<AppearancePreference>): void {
    this.appearance.setPreference(event.value);
  }
}
