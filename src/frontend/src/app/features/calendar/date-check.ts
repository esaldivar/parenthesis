import { computed, signal } from '@angular/core';
import { PlainDate } from '../dashboard/model';
import { RangeValue, dateIssues, rangeProblems } from './date-rules';

/** The date fields an API answer can be about. */
const DATE_KEYS = ['startsAt', 'endsAt'] as const;

/**
 * The state of an event form's dates (#248): which date shows red, and why for screen readers. It follows the dates
 * as the parent changes them, so correcting one clears its red at once. After a refused send it also shows a
 * missing date, and the server's date problems until the dates change. Nothing here moves a date.
 */
export class DateCheck {
  private readonly attempted = signal(false);
  private readonly server = signal<{ key: string; errors: Readonly<Record<string, string>> }>({ key: '', errors: {} });

  /**
   * `read` returns the form's dates (with unreadable typed dates as such) and must read a signal, so this follows
   * them. `own` are the days an edit may keep; `timeZone` is the family's.
   */
  constructor(
    private readonly read: () => RangeValue,
    private readonly today: () => PlainDate,
    private readonly own: () => readonly PlainDate[] = () => [],
    private readonly timeZone: () => string = () => 'UTC',
  ) {}

  private readonly key = computed(() => keyOf(this.read()));

  /** The problems with the dates as they are now, by the API's field names. */
  readonly problems = computed(() => rangeProblems(this.read(), this.today(), this.own(), this.timeZone()));

  /** What to mark: the reason for each date that's invalid, or null. */
  readonly issues = computed(() => {
    const server = this.server();
    return dateIssues(this.problems(), server.key === this.key() ? server.errors : {}, this.attempted());
  });

  /** A send was tried: missing dates now show too. */
  tried(): void {
    this.attempted.set(true);
  }

  /** The server's answer about the dates, kept until they change. */
  fromServer(errors: Readonly<Record<string, string>>): void {
    const dates = Object.fromEntries(DATE_KEYS.filter((k) => errors[k]).map((k) => [k, errors[k]]));
    this.server.set({ key: this.key(), errors: dates });
  }
}

const keyOf = (v: RangeValue) => [v.allDay, v.startDate, v.startTime, v.endDate, v.endTime].join('|');
