import { CalendarPalette } from './calendar-palette';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, input, output, untracked } from '@angular/core';
import { AddAt, SlotPick, clearsPick, pickLabel } from './slot';
import { PlainDate } from '../dashboard/model';
import { addDays, dayLong, dayOfMonth, startOfWeek, weekdayShort } from '../dashboard/week';
import { CalendarItem, onDate } from './calendar-items';
import { layOutWeek } from './month-layout';

/** The first day of the month containing `date`. */
export const startOfMonth = (date: PlainDate): PlainDate => `${date.slice(0, 8)}01`;

/** Six weeks, Sunday first, covering the month that contains `date`. */
export function monthGrid(date: PlainDate): PlainDate[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/**
 * The Month view (#250, owner decision October 23, 2026). Each item is a labelled bar across its own days, on phones
 * as on desktops: one continuous bar per week row, continued on the next row with a mark at each cut, in up to three
 * lanes. A busy day shows "+N more" (saying how many are pending), which opens its week. Day numbers open their
 * week; a day's empty space adds there (#212, #237).
 */
@Component({
  selector: 'app-calendar-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarPalette],
  template: `
    <section class="month" [attr.aria-label]="label()">
      <div class="month__head" aria-hidden="true">
        @for (name of weekdays(); track name) {
          <div class="month__weekday">{{ name }}</div>
        }
      </div>
      @for (week of weeks(); track week.days[0].date) {
        <div class="week">
          @for (day of week.days; track day.date; let i = $index) {
            <div
              class="day"
              [style.grid-column]="i + 1"
              [class.day--outside]="!day.inMonth"
              [class.is-today]="day.isToday"
              [class.is-picked]="pick.onDay(day.date)"
              [attr.aria-current]="day.isToday ? 'date' : null"
            >
              <!-- A tap on the day's empty space adds on that date (#212). Pointer only: keyboards open the day's week. -->
              <button type="button" class="day__add" tabindex="-1" aria-hidden="true" (click)="pick.tap({ date: day.date }, true)"></button>
              <button type="button" class="day__number" (click)="openDay.emit(day.date)" [attr.aria-label]="day.label">
                {{ day.number }}
              </button>
              @if (pick.onDay(day.date)) {
                <div class="slot-pick">
                  <button type="button" class="slot-pick__button" [attr.aria-label]="pickLabel(pick.at()!)" (click)="pick.confirm()">
                    Add
                  </button>
                </div>
              }
            </div>
          }
          @for (bar of week.bars; track bar.key) {
            <button
              type="button"
              class="item bar"
              [style.grid-column]="bar.start + ' / ' + bar.end"
              [style.grid-row]="bar.lane + 2"
              [attr.data-kind]="bar.item.kind" [appCalendarPalette]="bar.item.concealed ? 'concealed' : (bar.item.palette ?? bar.item.kind)"
              [attr.data-category]="bar.item.category"
              [attr.data-status]="bar.item.status"
              [attr.data-concealed]="bar.item.concealed ? 'true' : null"
              [class.bar--before]="bar.continuesBefore"
              [class.bar--after]="bar.continuesAfter"
              [attr.aria-label]="bar.label"
              (click)="selected.emit(bar.item)"
            >
              @if (bar.continuesBefore) {
                <span class="bar__cut" aria-hidden="true">‹</span>
              }
              @if (bar.status; as status) {
                <span class="bar__status" aria-hidden="true">{{ status }}{{ ' ' }}</span>
              }
              <span class="bar__title" [class.bar__title--declined]="bar.item.status === 'declined'" aria-hidden="true">{{
                bar.item.concealed ? 'Hidden: unavailable' : bar.item.title
              }}</span>
              @if (bar.continuesAfter) {
                <span class="bar__cut bar__cut--after" aria-hidden="true">›</span>
              }
            </button>
          }
          @for (more of week.more; track more.date) {
            <button
              type="button"
              class="more"
              [class.more--pending]="more.pending > 0"
              [style.grid-column]="more.column"
              [attr.aria-label]="more.label"
              (click)="openDay.emit(more.date)"
            >
              +{{ more.count }}<span class="more__word"> more</span>
            </button>
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
  /** A tap on a day's empty space adds on that date (#212). The day number still opens its week. */
  readonly add = output<AddAt>();

  /** The highlighted day (#237): a first tap highlights it, a tap on the highlight adds there. */
  protected readonly pick = new SlotPick((at) => this.add.emit(at));
  protected readonly pickLabel = pickLabel;

  constructor() {
    // Another month clears the highlight.
    effect(() => {
      this.date();
      untracked(() => this.pick.clear());
    });
  }

  @HostListener('document:click', ['$event.target'])
  protected clickAnywhere(target: EventTarget | null): void {
    if (clearsPick(target)) {
      this.pick.clear();
    }
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.pick.clear();
  }

  protected readonly weekdays = computed(() => monthGrid(this.date()).slice(0, 7).map(weekdayShort));

  protected readonly weeks = computed(() => {
    const month = this.date().slice(0, 7);
    const all = monthGrid(this.date());
    return Array.from({ length: 6 }, (_, w) => {
      const dates = all.slice(w * 7, w * 7 + 7);
      const days = dates.map((date) => {
        const count = onDate(this.items(), date).length;
        return {
          date,
          number: dayOfMonth(date),
          label: `${dayLong(date)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}. Open this week.`,
          inMonth: date.startsWith(month),
          isToday: date === this.today(),
        };
      });
      return { days, ...layOutWeek(dates, this.items()) };
    });
  });
}
