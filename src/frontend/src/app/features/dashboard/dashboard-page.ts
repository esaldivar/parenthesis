import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/empty-state/empty-state';

/**
 * Ordered by immediate need (docs/design-system.md): today and the next handoff, decisions waiting on you,
 * upcoming events, then recent memories. Every section is an honest empty state until its feature exists.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <h1>Home</h1>
    <p class="intro">A calm overview of your family's schedule and shared moments.</p>

    <div class="sections">
      <section aria-labelledby="today-heading">
        <h2 id="today-heading">Today</h2>
        <app-empty-state
          icon="calendar"
          title="Nothing scheduled to show yet"
          body="When the shared calendar is ready, today's plans and the next handoff will appear here."
        />
      </section>

      <section aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">Waiting for you</h2>
        <app-empty-state
          icon="approvals"
          title="No requests"
          body="Proposed schedule changes and deletion requests that need your answer will be listed here."
        />
      </section>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Coming up</h2>
        <app-empty-state
          icon="calendar"
          title="No upcoming events yet"
          body="School events, appointments and activities will show here once the calendar is available."
        />
      </section>

      <section aria-labelledby="memories-heading">
        <h2 id="memories-heading">Recent memories</h2>
        <app-empty-state
          icon="image"
          title="No memories shared yet"
          body="Photos and artwork shared with your family will appear here when memories are available."
        />
      </section>
    </div>
  `,
  styles: `
    .intro {
      color: var(--color-text-secondary);
      margin-bottom: var(--space-6);
    }
    .sections {
      display: grid;
      gap: var(--space-6);
    }
    section {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
    // Two columns on wide screens; DOM (and reading) order stays Today → Waiting → Coming up → Memories.
    @media (min-width: 1100px) {
      .sections {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class DashboardPage {}
