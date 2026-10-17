import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon/icon';

/** The calendar key (bottom right of the week calendar): each style the calendar uses, named in text. */
@Component({
  selector: 'app-calendar-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <ul class="legend" aria-label="Calendar key">
      <li><span class="legend__swatch legend__swatch--parenting" aria-hidden="true"></span>Parenting time</li>
      <li><span class="legend__swatch legend__swatch--family" aria-hidden="true"></span>Family event (both parents)</li>
      <li><span class="legend__swatch legend__swatch--proposed" aria-hidden="true"></span>Proposed</li>
      <li>
        <span class="legend__swatch legend__swatch--unavailable" aria-hidden="true"><app-icon name="block" [size]="12" /></span>
        Unavailable
      </li>
    </ul>
  `,
  styleUrl: './calendar-key.scss',
})
export class CalendarKey {}
