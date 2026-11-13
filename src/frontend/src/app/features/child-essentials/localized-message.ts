import { computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey, translate } from '../../core/i18n/translations';

/** Retain the message key so feedback also changes language without resetting the form. */
export function localizedMessage() {
  const locale = inject(LocaleService);
  const message = signal<{ key: TranslationKey; params?: Readonly<Record<string, string | number>> } | null>(null);
  return Object.assign(computed(() => {
    const current = message();
    return current ? translate(current.key, locale.locale(), current.params) : '';
  }), {
    set(key: TranslationKey | '', params?: Readonly<Record<string, string | number>>): void {
      message.set(key ? { key, params } : null);
    },
  });
}
