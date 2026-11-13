import { TranslatePipe, TranslationKey } from '../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { AppearancePreference, AppearanceService } from '../../../core/theme/appearance.service';

interface AppearanceOption {
  readonly value: AppearancePreference;
  readonly label: TranslationKey;
}

/** Labelled, keyboard-operable radio group for each person's own Light / Dark / System choice. */
@Component({
  selector: 'app-appearance-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatRadioModule],
  template: `
    <h2 id="appearance-heading">{{ 'feature.appearance' | tr }}</h2>
    <p id="appearance-help" class="help">
      {{ 'feature.this.only.changes.how.parenthesis.looks.for' | tr }}
    </p>
    <mat-radio-group
      class="options"
      aria-labelledby="appearance-heading"
      aria-describedby="appearance-help"
      [value]="appearance.preference()"
      (change)="choose($event)"
    >
      @for (option of options; track option.value) {
        <mat-radio-button [value]="option.value">{{ option.label | tr }}</mat-radio-button>
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
    { value: 'light', label: 'appearance.light' },
    { value: 'dark', label: 'appearance.dark' },
    { value: 'system', label: 'appearance.system' },
  ];

  protected choose(event: MatRadioChange<AppearancePreference>): void {
    this.appearance.setPreference(event.value);
  }
}
