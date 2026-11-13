import { inject } from '@angular/core';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { CalendarPalette } from '../../calendar-palette';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlainDate } from '../../../../core/dates/plain-date';
import { addDays, dayLong, daysBetween } from '../../../../core/dates/dates';
import { CalendarItem, byStart, onDate } from '../../calendar-items';
import { ItemText } from '../item-text/item-text.component';

/** The List view: every day in the range that has something on it, in order. */
@Component({
  selector: 'app-calendar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, ItemText],
  template: `
    <ol class="days">
      @for (day of days(); track day.date) {
        <li>
          <h3 [class.is-today]="day.isToday">{{ day.label }}@if (day.isToday) {<span class="today"> {{ 'feature.today' | tr }}</span>}</h3>
          <ul class="items">
            @for (item of day.items; track item.id) {
              <li>
                <button
                  type="button"
                  class="item"
                  [attr.data-kind]="item.kind" [appCalendarPalette]="item.concealed ? 'concealed' : (item.palette ?? item.kind)"
                  [attr.data-category]="item.category"
                  [attr.data-status]="item.status"
                  [attr.data-concealed]="item.concealed ? 'true' : null"
                  (click)="selected.emit(item)"
                >
                  <app-item-text [item]="item" />
                </button>
              </li>
            }
          </ul>
        </li>
      }
    </ol>
  `,
  styleUrl: './calendar-list.component.scss',
})
export class CalendarList {
  private readonly locale = inject(LocaleService);
  /** First date shown (inclusive) and the date after the last. */
  readonly from = input.required<PlainDate>();
  readonly to = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly selected = output<CalendarItem>();

  protected readonly days = computed(() =>
    Array.from({ length: daysBetween(this.from(), this.to()) }, (_, i) => addDays(this.from(), i))
      .map((date) => ({ date, label: dayLong(date, this.locale.locale()), isToday: date === this.today(), items: onDate(this.items(), date).sort(byStart) }))
      .filter((d) => d.items.length > 0),
  );
}
