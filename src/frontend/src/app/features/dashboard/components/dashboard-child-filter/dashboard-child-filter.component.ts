import { TranslatePipe } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../../../../shared/icon/icon';
import { ChildRef } from '../../model';

/** A view-only, single-choice child selector for Home. Child names come from the authorized family list. */
@Component({
  selector: 'app-dashboard-child-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, Icon],
  templateUrl: './dashboard-child-filter.component.html',
  styleUrl: './dashboard-child-filter.component.scss',
})
export class DashboardChildFilter {
  readonly children = input.required<readonly ChildRef[]>();
  readonly selectedChild = input<string | null>(null);
  readonly changed = output<string | null>();
}
