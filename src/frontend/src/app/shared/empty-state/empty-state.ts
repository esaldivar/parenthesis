import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

/**
 * A neutral, honest empty state. Used for features that aren't built yet: it says so plainly and never shows
 * pretend data or fake success.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="empty-state">
      <span class="empty-state__icon"><app-icon [name]="icon()" [size]="28" /></span>
      <div>
        <p class="empty-state__title">{{ title() }}</p>
        <p class="empty-state__body">{{ body() }}</p>
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .empty-state {
      display: flex;
      gap: var(--space-4);
      align-items: flex-start;
      padding: var(--space-4);
      border: 1px dashed var(--color-outline);
      border-radius: var(--radius-card);
      background: var(--color-canvas);
    }
    .empty-state__icon {
      display: inline-grid;
      place-items: center;
      width: 48px;
      height: 48px;
      flex: none;
      border-radius: 50%;
      background: var(--color-surface-soft);
      color: var(--color-text);
    }
    .empty-state__title {
      font-weight: 600;
      margin-bottom: var(--space-1);
    }
    .empty-state__body {
      color: var(--color-text-secondary);
      margin: 0;
    }
  `,
})
export class EmptyState {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly body = input.required<string>();
}
