import { Injectable, Provider, inject } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, MatDateFormats } from '@angular/material/core';
import { AuthStore } from '../../core/auth/auth.store';
import { PlainDate } from '../dashboard/model';
import { addDays, todayIn } from '../dashboard/week';

/** Something that isn't a date, for a typed value that can't be read. */
const INVALID = 'invalid-date';
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const US = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const utc = (date: PlainDate) => new Date(`${date}T00:00:00Z`);

/** A real calendar date in "YYYY-MM-DD" form. */
export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'string') {
    return false;
  }
  const match = ISO.exec(value);
  if (!match) {
    return false;
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/**
 * The Material date pickers (#232) on the forms' own values: dates stay "YYYY-MM-DD" strings in the family's calendar,
 * as everywhere else, so nothing shifts with the device's time zone. "Today" is the family's today. Typed dates are read
 * as 10/27/2026 or 2026-10-27.
 */
@Injectable()
export class PlainDateAdapter extends DateAdapter<PlainDate> {
  private readonly auth = inject(AuthStore, { optional: true });

  constructor() {
    super();
    this.setLocale('en-US');
  }

  private intl(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }

  getYear(date: PlainDate): number {
    return Number(date.slice(0, 4));
  }

  getMonth(date: PlainDate): number {
    return Number(date.slice(5, 7)) - 1;
  }

  getDate(date: PlainDate): number {
    return Number(date.slice(8, 10));
  }

  getDayOfWeek(date: PlainDate): number {
    return utc(date).getUTCDay();
  }

  getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    const format = this.intl({ month: style });
    return Array.from({ length: 12 }, (_, m) => format.format(new Date(Date.UTC(2026, m, 1))));
  }

  getDateNames(): string[] {
    return Array.from({ length: 31 }, (_, i) => String(i + 1));
  }

  getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    const format = this.intl({ weekday: style });
    // January 4, 2026 was a Sunday.
    return Array.from({ length: 7 }, (_, d) => format.format(new Date(Date.UTC(2026, 0, 4 + d))));
  }

  getYearName(date: PlainDate): string {
    return String(this.getYear(date));
  }

  /** Weeks start on Sunday, as the calendar's weeks do. */
  getFirstDayOfWeek(): number {
    return 0;
  }

  getNumDaysInMonth(date: PlainDate): number {
    return new Date(Date.UTC(this.getYear(date), this.getMonth(date) + 1, 0)).getUTCDate();
  }

  clone(date: PlainDate): PlainDate {
    return date;
  }

  createDate(year: number, month: number, date: number): PlainDate {
    const value = `${pad(year, 4)}-${pad(month + 1)}-${pad(date)}`;
    if (!isPlainDate(value)) {
      throw Error(`Invalid date "${value}".`);
    }
    return value;
  }

  today(): PlainDate {
    return todayIn(
      this.auth?.currentFamily()?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      new Date(),
    );
  }

  parse(value: unknown): PlainDate | null {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value !== 'string') {
      return this.invalid();
    }
    const text = value.trim();
    if (isPlainDate(text)) {
      return text;
    }
    const us = US.exec(text);
    if (us) {
      const candidate = `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
      return isPlainDate(candidate) ? candidate : this.invalid();
    }
    return this.invalid();
  }

  format(date: PlainDate, displayFormat: Intl.DateTimeFormatOptions): string {
    if (!this.isValid(date)) {
      throw Error('Cannot format an invalid date.');
    }
    return this.intl(displayFormat).format(utc(date));
  }

  addCalendarYears(date: PlainDate, years: number): PlainDate {
    return this.addCalendarMonths(date, years * 12);
  }

  addCalendarMonths(date: PlainDate, months: number): PlainDate {
    const total = this.getYear(date) * 12 + this.getMonth(date) + months;
    const [year, month] = [Math.floor(total / 12), ((total % 12) + 12) % 12];
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return this.createDate(year, month, Math.min(this.getDate(date), last));
  }

  addCalendarDays(date: PlainDate, days: number): PlainDate {
    return addDays(date, days);
  }

  toIso8601(date: PlainDate): string {
    return date;
  }

  override deserialize(value: unknown): PlainDate | null {
    if (value == null || value === '') {
      return null;
    }
    return isPlainDate(value) ? value : this.invalid();
  }

  isDateInstance(obj: unknown): boolean {
    return typeof obj === 'string';
  }

  isValid(date: PlainDate): boolean {
    return isPlainDate(date);
  }

  invalid(): PlainDate {
    return INVALID;
  }
}

/** Shown as 10/27/2026 in the field; the calendar's headings and screen-reader labels in words. */
export const PLAIN_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: { month: 'numeric', day: 'numeric', year: 'numeric' },
    monthYearLabel: { month: 'short', year: 'numeric' },
    dateA11yLabel: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

/** The providers a form with a date picker needs. */
export function providePlainDates(): Provider[] {
  return [
    { provide: DateAdapter, useClass: PlainDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: PLAIN_DATE_FORMATS },
  ];
}
