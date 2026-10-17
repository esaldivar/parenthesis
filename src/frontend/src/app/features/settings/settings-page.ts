import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearancePicker],
  template: `
    <h1>Settings</h1>
    <section class="card">
      <app-appearance-picker />
    </section>
  `,
  styles: `
    .card {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
  `,
})
export class SettingsPage {}
