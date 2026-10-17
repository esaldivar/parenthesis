import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { startOfWeek, weekLabel } from '../dashboard/week';

const VIEWS = { week: 'Week', month: 'Month', list: 'List' } as const;
type CalendarView = keyof typeof VIEWS;

/**
 * The full Calendar page. It receives the week the dashboard was showing (`?week=YYYY-MM-DD`, any day of it) and
 * the chosen view (`?view=week|month|list`), so moving here preserves the selection. The full calendar isn't built
 * yet, so it says so plainly rather than showing an empty grid that looks real.
 */
@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState],
  template: `
    <h1>Calendar</h1>
    <p class="context">
      {{ viewLabel() }} view
      @if (weekText(); as weekText) {
        · week of {{ weekText }}
      }
    </p>
    <app-empty-state
      icon="calendar"
      title="The full calendar isn’t available yet"
      [body]="'The ' + viewLabel().toLowerCase() + ' view will open here with the week you were looking at. Nothing you see elsewhere is scheduled until the calendar launches.'"
    />
    <p class="back">
      <a routerLink="/" [queryParams]="week() ? { week: week() } : {}">Back to Home</a>
    </p>
  `,
  styles: `
    .context {
      color: var(--color-text-secondary);
      margin-bottom: var(--space-6);
    }
    .back {
      margin-top: var(--space-6);
    }
    .back a {
      display: inline-flex;
      align-items: center;
      min-height: var(--target-min);
    }
  `,
})
export class CalendarPage {
  readonly view = input<string>();
  readonly week = input<string>();

  protected readonly viewLabel = computed(() => VIEWS[(this.view() ?? 'week') as CalendarView] ?? VIEWS.week);
  protected readonly weekText = computed(() => {
    const week = this.week();
    return week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekLabel(startOfWeek(week)) : null;
  });
}
