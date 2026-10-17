import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ScheduleStatus } from './model';

const LABELS: Record<ScheduleStatus | 'change-pending', string> = {
  confirmed: 'Confirmed',
  proposed: 'Proposed',
  rejected: 'Rejected',
  'change-pending': 'Change pending',
};

/** A text status chip. The word carries the meaning; colour and border style only support it. */
@Component({
  selector: 'app-status-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'status', '[attr.data-status]': 'status()' },
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-outline);
      color: var(--color-text);
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
    }
    :host([data-status='confirmed']) {
      background: var(--color-status-confirmed-bg);
    }
    :host([data-status='proposed']),
    :host([data-status='change-pending']) {
      background: var(--color-status-pending-bg);
      border-style: dashed;
    }
    :host([data-status='rejected']) {
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class StatusLabel {
  readonly status = input.required<ScheduleStatus | 'change-pending'>();
  protected readonly label = computed(() => LABELS[this.status()]);
}
