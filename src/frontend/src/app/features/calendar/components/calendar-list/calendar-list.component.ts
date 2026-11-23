import { inject } from '@angular/core';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { CalendarPalette } from '../../calendar-palette';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlainDate } from '../../../../core/dates/plain-date';
import { addDays, dayLong, daysBetween, monthDay, weekdayShort } from '../../../../core/dates/dates';
import { NarrowHost } from '../../narrow';
import { CalendarItem, byStart, onDate } from '../../calendar-items';
import { ItemCard } from '../item-card/item-card.component';

/**
 * The List view (#729, Quiet Planner): every day in the range that has something on it, under its date, each item a card
 * tinted by its type. Phones put the time with the type instead of in a column.
 */
@Component({
  selector: 'app-calendar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, ItemCard],
  template: `
    <ol class="days">
      @for (day of days(); track day.date) {
        <li class="day">
          <!-- The full date is the heading; the short one is what shows (#729). -->
          <div class="day__head" [class.is-today]="day.isToday">
            <h3 class="visually-hidden">{{ day.label }}@if (day.isToday) {<span class="today"> {{ 'feature.today' | tr }}</span>}</h3>
            <span aria-hidden="true">{{ day.short }}</span>
            @if (day.isToday) {
              <span class="today" aria-hidden="true">{{ 'feature.today' | tr }}</span>
            }
          </div>
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
                  <app-item-card [item]="item" [layout]="narrow() ? 'agenda' : 'list'" />
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
export class CalendarList extends NarrowHost {
  private readonly locale = inject(LocaleService);
  /** First date shown (inclusive) and the date after the last. */
  readonly from = input.required<PlainDate>();
  readonly to = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly selected = output<CalendarItem>();

  protected readonly days = computed(() =>
    Array.from({ length: daysBetween(this.from(), this.to()) }, (_, i) => addDays(this.from(), i))
      .map((date) => ({
        date,
        label: dayLong(date, this.locale.locale()),
        short: `${weekdayShort(date, this.locale.locale())}, ${monthDay(date, this.locale.locale())}`,
        isToday: date === this.today(),
        items: onDate(this.items(), date).sort(byStart),
      }))
      .filter((d) => d.items.length > 0),
  );
}
