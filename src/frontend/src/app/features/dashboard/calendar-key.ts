import { CalendarPalette } from '../calendar/calendar-palette';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon/icon';

/** The calendar key (bottom right of the week calendar): each style the calendar uses, named in text. */
@Component({
  selector: 'app-calendar-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarPalette, Icon],
  template: `
    <ul class="legend" aria-label="Calendar key">
      <li><span class="legend__swatch" appCalendarPalette="parent-a" aria-hidden="true"></span><span class="legend__swatch" appCalendarPalette="parent-b" aria-hidden="true"></span>Parenting time · parent colors</li>
      <li><span class="legend__swatch legend__swatch--family" appCalendarPalette="family" aria-hidden="true"></span>Family event (both parents)</li>
      <li><span class="legend__swatch" appCalendarPalette="activity" aria-hidden="true"></span>Activity</li>
      <li><span class="legend__swatch" appCalendarPalette="task" aria-hidden="true"></span>Task</li>
      <li><span class="legend__swatch" appCalendarPalette="reminder" aria-hidden="true"></span>Reminder</li>
      <li><span class="legend__swatch legend__swatch--proposed" aria-hidden="true"></span>Proposed</li>
      <li>
        <span class="legend__swatch legend__swatch--unavailable" appCalendarPalette="unavailable" aria-hidden="true"><app-icon name="block" [size]="12" /></span>
        Unavailable
      </li>
    </ul>
  `,
  styleUrl: './calendar-key.scss',
})
export class CalendarKey {}
