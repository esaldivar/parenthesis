import { inject } from '@angular/core';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { CalendarPalette } from '../../calendar-palette';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, input, output, signal, untracked } from '@angular/core';
import { AddAt, SlotPick, clearsPick, pickLabel } from '../../slot';
import { PlainDate } from '../../../../core/dates/plain-date';
import { addDays, dayLong, dayOfMonth, startOfWeek, weekdayShort } from '../../../../core/dates/dates';
import { CalendarItem, byStart, onDate } from '../../calendar-items';
import { MonthBar, layOutWeek } from '../../month-layout';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ItemCard, displayTitle } from '../item-card/item-card.component';
import { itemSummary } from '../item-text/item-text.component';
import { NarrowHost } from '../../narrow';

/** The first day of the month containing `date`. */
export const startOfMonth = (date: PlainDate): PlainDate => `${date.slice(0, 8)}01`;

/** Six weeks, Sunday first, covering the month that contains `date`. */
export function monthGrid(date: PlainDate): PlainDate[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Items a phone's day agenda lists before "+N more" opens the week (#729). */
const AGENDA_ITEMS = 3;
/** Dots a phone's day shows for its items. */
const DAY_DOTS = 3;

/**
 * The Month view (#250; Quiet Planner #729). Each week has its own parenting-time row: one continuous bar per caregiver
 * across the days it covers, continued on the next row with a mark at each cut. Other items sit in two lanes under it,
 * a proposal as a labelled chip ("Proposed · Dinner"); a busy day shows "+N more" (saying how many are pending), which
 * opens its week. Hidden unavailable time is a marker by the date.
 *
 * Phones keep the parenting bars, by name only, and show a day's other items as dots: choosing a day lists them below
 * the month with everyone's photos. On desktop the day number opens its week; a day's empty space adds there (#212,
 * #237).
 */
@Component({
  selector: 'app-calendar-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, Avatar, Icon, ItemCard],
  templateUrl: './calendar-month.component.html',
  styleUrl: './calendar-month.component.scss',
})
export class CalendarMonth extends NarrowHost {
  private readonly locale = inject(LocaleService);
  readonly date = input.required<PlainDate>();
  readonly today = input.required<PlainDate>();
  readonly items = input.required<readonly CalendarItem[]>();
  readonly label = input('Month');
  /** The date the page is showing: a phone opens its agenda there when it's in this month (#729). */
  readonly anchor = input<PlainDate | null>(null);
  readonly selected = output<CalendarItem>();
  /** A day was chosen: the page opens its week. */
  readonly openDay = output<PlainDate>();
  /** A tap on a day's empty space adds on that date (#212). The day number still opens its week. */
  readonly add = output<AddAt>();

  /** The highlighted day (#237): a first tap highlights it, a tap on the highlight adds there. */
  protected readonly pick = new SlotPick((at) => this.add.emit(at));
  protected readonly pickLabel = pickLabel;

  /** The phone's chosen day (#729); by default today in this month, or the month's first day. */
  private readonly chosen = signal<PlainDate | null>(null);
  protected readonly selectedDay = computed(() => {
    const month = this.date().slice(0, 7);
    const chosen = this.chosen();
    if (chosen?.startsWith(month)) return chosen;
    if (this.anchor()?.startsWith(month)) return this.anchor()!;
    return this.today().startsWith(month) ? this.today() : startOfMonth(this.date());
  });

  constructor() {
    super();
    // Another month clears the highlight and the chosen day.
    effect(() => {
      this.date();
      untracked(() => {
        this.pick.clear();
        this.chosen.set(null);
      });
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

  /** Desktop: the day number opens its week. Phones: it chooses the day for the agenda below. */
  protected dayNumber(date: PlainDate): void {
    if (this.narrow()) {
      this.chosen.set(date);
    } else {
      this.openDay.emit(date);
    }
  }

  protected readonly weekdays = computed(() => monthGrid(this.date()).slice(0, 7).map((date) => weekdayShort(date, this.locale.locale())));

  protected readonly weeks = computed(() => {
    const locale = this.locale.locale();
    const month = this.date().slice(0, 7);
    const all = monthGrid(this.date());
    return Array.from({ length: 6 }, (_, w) => {
      const dates = all.slice(w * 7, w * 7 + 7);
      const days = dates.map((date) => {
        const on = onDate(this.items(), date);
        const count = on.length;
        const others = on.filter((i) => i.kind !== 'parenting' && !i.concealed && i.lastDate === i.firstDate).sort(byStart);
        const params = { date: dayLong(date, locale), count };
        return {
          date,
          number: dayOfMonth(date),
          label: translate(count === 0 ? 'calendar.month.openWeek' : count === 1 ? 'calendar.month.openWeekOne' : 'calendar.month.openWeekMany', locale, params),
          chooseLabel: translate(count === 0 ? 'calendar.qp.showDay' : count === 1 ? 'calendar.qp.showDayOne' : 'calendar.qp.showDayMany', locale, params),
          inMonth: date.startsWith(month),
          isToday: date === this.today(),
          dots: others.slice(0, DAY_DOTS).map((i) => ({ id: i.id, palette: i.palette ?? i.kind })),
          proposed: others.filter((i) => i.status === 'pending').length,
        };
      });
      // Phones keep parenting time and longer items as bars and show one-day items as dots (#729).
      const items = this.narrow() ? this.items().filter((i) => i.kind === 'parenting' || i.concealed || i.lastDate > i.firstDate) : this.items();
      return { days, ...layOutWeek(dates, items, locale) };
    });
  });

  /** The phone's day agenda (#729): what's on the chosen day, people and status included. */
  protected readonly agenda = computed(() => {
    const date = this.selectedDay();
    // All-day first, then proposals so the short list never hides one, then by time (#729).
    const on = onDate(this.items(), date).sort(
      (a, b) => Number(b.spansDays) - Number(a.spansDays) || Number(b.status === 'pending') - Number(a.status === 'pending') || byStart(a, b),
    );
    const shown = on.filter((i) => !i.concealed);
    return {
      date,
      title: dayLong(date, this.locale.locale()),
      // Each agenda item names its full date, as Month bars do (#250).
      fullDate: `${dayLong(date, this.locale.locale() === 'en' ? 'en-US' : this.locale.locale())}, ${date.slice(0, 4)}`,
      items: shown.slice(0, AGENDA_ITEMS),
      more: Math.max(0, shown.length - AGENDA_ITEMS),
      proposed: shown.filter((i) => i.status === 'pending').length,
      concealed: on.filter((i) => i.concealed),
    };
  });

  /** A confirmed single-day item reads as a line with a dot; proposals and longer items are tinted bars. */
  protected readonly isLine = (bar: MonthBar) =>
    bar.row === 'items' && bar.item.status !== 'pending' && bar.item.status !== 'change-pending' && bar.start + 1 === bar.end;
  protected readonly concealedLabel = (item: CalendarItem) => itemSummary(item, this.locale.locale());
  protected readonly displayTitle = (item: CalendarItem) => displayTitle(item, this.locale.locale());
  /** A bar's name starts with what it shows when that differs from its title ("Sam · Unavailable"; WCAG 2.5.3). */
  protected readonly barLabel = (bar: MonthBar) => {
    const shown = displayTitle(bar.item, this.locale.locale());
    return shown === bar.item.title || bar.row === 'parenting' ? bar.label : `${shown}, ${bar.label}`;
  };
  /** Phones name the caregiver on a parenting bar; the title and status stay in its accessible name. */
  protected readonly caregiver = (item: CalendarItem) => item.parents[0]?.name ?? item.title;
}
