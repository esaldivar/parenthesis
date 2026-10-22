import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { addDays, dayLong, dayOfMonth, startOfWeek, weekdayShort } from '../dashboard/week';
import { CalendarItem, byStart, onDate } from './calendar-items';
import { ItemText } from './item-text';

/** The first day of the month containing `date`. */
export const startOfMonth = (date: PlainDate): PlainDate => `${date.slice(0, 8)}01`;

/** Six weeks, Sunday first, covering the month that contains `date`. */
export function monthGrid(date: PlainDate): PlainDate[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const SHOWN = 3;

/**
 * The Month view. Each day lists up to three items as buttons and says how many more there are; on phones the
 * cells show only dots (no avatars), and tapping a day opens that week.
 */
@Component({
  selector: 'app-calendar-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemText],
  template: `
    <section class="month" [attr.aria-label]="label()">
      <div class="month__row" aria-hidden="true">
        @for (name of weekdays(); track name) {
          <div class="month__weekday">{{ name }}</div>
        }
      </div>
      @for (week of weeks(); track week[0].date) {
        <div class="month__row">
          @for (day of week; track day.date) {
            <div
              class="day"
              [class.day--outside]="!day.inMonth"
              [class.is-today]="day.isToday"
              [attr.aria-current]="day.isToday ? 'date' : null"
            >
              <button type="button" class="day__number" (click)="openDay.emit(day.date)" [attr.aria-label]="day.label">
                {{ day.number }}
              </button>
              @if (day.items.length > 0) {
                <ul class="day__items">
                  @for (item of day.shown; track item.id) {
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
                        <app-item-text [item]="item" [compact]="true" />
                      </button>
                    </li>
                  }
                </ul>
                @if (day.more > 0) {
                  <button type="button" class="day__more" (click)="openDay.emit(day.date)">+{{ day.more }} more</button>
                }
                <span class="day__dots" aria-hidden="true">
                  @for (item of day.items.slice(0, 4); track item.id) {
                    <span
                      class="dot"
                      [attr.data-kind]="item.kind"
                      [attr.data-category]="item.category"
                      [attr.data-status]="item.status"
                      [attr.data-concealed]="item.concealed ? 'true' : null"
                    ></span>
                  }
                </span>
              }
            </div>
          }
        </div>
      }
    </section>
  `,
  styleUrl: './calendar-month.scss',
})
export class CalendarMonth {
  readonly date = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly label = input('Month');
  readonly selected = output<CalendarItem>();
  /** A day was chosen: the page opens its week. */
  readonly openDay = output<PlainDate>();

  protected readonly weekdays = computed(() => monthGrid(this.date()).slice(0, 7).map(weekdayShort));

  protected readonly weeks = computed(() => {
    const month = this.date().slice(0, 7);
    const days = monthGrid(this.date()).map((date) => {
      const items = onDate(this.items(), date).sort(byStart);
      return {
        date,
        number: dayOfMonth(date),
        label: `${dayLong(date)}${items.length ? `, ${items.length} ${items.length === 1 ? 'event' : 'events'}` : ''}. Open this week.`,
        inMonth: date.startsWith(month),
        isToday: date === this.today(),
        items,
        shown: items.slice(0, SHOWN),
        more: Math.max(0, items.length - SHOWN),
      };
    });
    return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  });
}
