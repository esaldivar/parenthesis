import { TranslatePipe } from '../../core/i18n/translations';
import { CalendarPalette } from '../calendar/calendar-palette';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon/icon';

/** The calendar key (bottom right of the week calendar): each style the calendar uses, named in text. */
@Component({
  selector: 'app-calendar-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, Icon],
  template: `
    <ul class="legend" aria-label="{{ 'feature.calendar.key' | tr }}">
      <li><span class="legend__swatch" appCalendarPalette="parent-a" aria-hidden="true"></span><span class="legend__swatch" appCalendarPalette="parent-b" aria-hidden="true"></span>{{ 'feature.parenting.time.parent.colors' | tr }}</li>
      <li><span class="legend__swatch legend__swatch--family" appCalendarPalette="family" aria-hidden="true"></span>{{ 'feature.family.event.both.parents' | tr }}</li>
      <li><span class="legend__swatch" appCalendarPalette="activity" aria-hidden="true"></span>{{ 'feature.activity' | tr }}</li>
      <li><span class="legend__swatch" appCalendarPalette="task" aria-hidden="true"></span>{{ 'feature.task' | tr }}</li>
      <li><span class="legend__swatch" appCalendarPalette="reminder" aria-hidden="true"></span>{{ 'feature.reminder' | tr }}</li>
      <li><span class="legend__swatch legend__swatch--proposed" aria-hidden="true"></span>{{ 'feature.proposed' | tr }}</li>
      <li>
        <span class="legend__swatch legend__swatch--unavailable" appCalendarPalette="unavailable" aria-hidden="true"><app-icon name="block" [size]="12" /></span>
        {{ 'feature.unavailable' | tr }}
      </li>
    </ul>
  `,
  styleUrl: './calendar-key.scss',
})
export class CalendarKey {}
