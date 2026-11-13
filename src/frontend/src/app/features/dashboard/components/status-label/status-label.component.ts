import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslationKey, translate } from '../../../../core/i18n/translations';
import { ScheduleStatus } from '../../model';

const LABELS: Record<ScheduleStatus | 'change-pending', TranslationKey> = {
  confirmed: 'dash.status.confirmed',
  proposed: 'dash.status.proposed',
  rejected: 'dash.status.rejected',
  'change-pending': 'dash.status.change-pending',
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
  private readonly locale = inject(LocaleService);
  /** In the viewer's language (#534). */
  protected readonly label = computed(() => translate(LABELS[this.status()], this.locale.locale()));
}
