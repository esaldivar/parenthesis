import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import latinAmericanSpanish from '@angular/common/locales/es-419';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';

registerLocaleData(latinAmericanSpanish);

/**
 * A fixed month-first pattern ("MMM d", "MMM d, h:mm a") written day-first for Spanish ("7 nov", "7 nov, 2:08 p.m."),
 * as Spanish dates read elsewhere in the app (#534). Named formats such as 'mediumDate' already follow the locale.
 */
export function localDateFormat(format: string | undefined, locale: string): string | undefined {
  return format && locale !== 'en' ? format.replace(/^MMM d(?!d)/, 'd MMM') : format;
}

@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  private readonly date = new DatePipe('en-US');

  transform(value: string | number | Date | null | undefined, format?: string, timezone?: string): string | null {
    const locale = this.locale.locale();
    return value == null ? null : this.date.transform(value, localDateFormat(format, locale), timezone, locale);
  }
}

@Pipe({ name: 'appCurrency', pure: false })
export class AppCurrencyPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  private readonly currency = new CurrencyPipe('en-US');

  transform(value: number | string | null | undefined, code: string, display = 'symbol', digits?: string): string | null {
    return value == null ? null : this.currency.transform(value, code, display, digits, this.locale.locale());
  }
}
