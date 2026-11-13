import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EmptyState } from '../empty-state/empty-state';
import { IconName } from '../icon/icon';

/** A whole page for a feature that isn't built yet. Configured through route data. */
@Component({
  selector: 'app-coming-soon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <h1>{{ heading() }}</h1>
    @if (intro(); as intro) {
      <p class="intro">{{ intro }}</p>
    }
    <app-empty-state [icon]="icon()" [title]="emptyTitle()" [body]="emptyBody()" />
  `,
  styles: `
    .intro {
      color: var(--color-text-secondary);
      max-width: 40rem;
      margin-bottom: var(--space-6);
    }
  `,
})
export class ComingSoonPage {
  // Bound from route data (withComponentInputBinding).
  readonly heading = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly intro = input<string>();
  readonly emptyTitle = input('Not available yet');
  readonly emptyBody = input.required<string>();
}
