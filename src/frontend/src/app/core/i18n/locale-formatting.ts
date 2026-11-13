import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import latinAmericanSpanish from '@angular/common/locales/es-419';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';

registerLocaleData(latinAmericanSpanish);

@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  private readonly date = new DatePipe('en-US');

  transform(value: string | number | Date | null | undefined, format?: string, timezone?: string): string | null {
    return value == null ? null : this.date.transform(value, format, timezone, this.locale.locale());
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
