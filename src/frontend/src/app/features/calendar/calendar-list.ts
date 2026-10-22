import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { addDays, dayLong, daysBetween } from '../dashboard/week';
import { CalendarItem, byStart, onDate } from './calendar-items';
import { ItemText } from './item-text';

/** The List view: every day in the range that has something on it, in order. */
@Component({
  selector: 'app-calendar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemText],
  template: `
    <ol class="days">
      @for (day of days(); track day.date) {
        <li>
          <h3 [class.is-today]="day.isToday">{{ day.label }}@if (day.isToday) {<span class="today"> · Today</span>}</h3>
          <ul class="items">
            @for (item of day.items; track item.id) {
              <li>
                <button
                  type="button"
                  class="item"
                  [attr.data-kind]="item.kind"
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
  styleUrl: './calendar-list.scss',
})
export class CalendarList {
  /** First date shown (inclusive) and the date after the last. */
  readonly from = input.required<PlainDate>();
  readonly to = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly selected = output<CalendarItem>();

  protected readonly days = computed(() =>
    Array.from({ length: daysBetween(this.from(), this.to()) }, (_, i) => addDays(this.from(), i))
      .map((date) => ({ date, label: dayLong(date), isToday: date === this.today(), items: onDate(this.items(), date).sort(byStart) }))
      .filter((d) => d.items.length > 0),
  );
}
