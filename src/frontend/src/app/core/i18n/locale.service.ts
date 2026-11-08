import { Injectable, signal } from '@angular/core';

export type AppLocale = 'en' | 'es-419';
const LOCALE_KEY = 'parenthesis.locale';
const ACCOUNT_LOCALE_PREFIX = 'parenthesis.locale.account.';

/** Only the supported Spanish family selects es-419; everything else falls back to English. */
export function detectLocale(languages: readonly string[]): AppLocale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized === 'es' || normalized.startsWith('es-')) return 'es-419';
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  }
  return 'en';
}

export function resolveLocale(saved: string | null, languages: readonly string[]): AppLocale {
  if (saved === 'en' || saved === 'es-419') return saved;
  return detectLocale(languages);
}

/** Runtime language state for the signed-out experience; account preferences will follow in phase B. */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly selected = signal<AppLocale>(this.initialLocale());
  readonly locale = this.selected.asReadonly();
  private accountId: string | null = null;

  constructor() {
    this.updateDocumentLanguage(this.selected());
  }

  /** Isolate each parent's choice on a shared device, including after switching profiles. */
  useAccount(accountId: string | null): void {
    this.accountId = accountId;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(accountId ? ACCOUNT_LOCALE_PREFIX + accountId : LOCALE_KEY);
    } catch {
      // Browser storage is optional.
    }
    const locale = resolveLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages);
    this.selected.set(locale);
    this.updateDocumentLanguage(locale);
  }

  setLocale(locale: AppLocale): void {
    this.selected.set(locale);
    this.updateDocumentLanguage(locale);
    try {
      localStorage.setItem(this.accountId ? ACCOUNT_LOCALE_PREFIX + this.accountId : LOCALE_KEY, locale);
    } catch {
      // Storage may be unavailable; the in-memory choice still works.
    }
  }

  private initialLocale(): AppLocale {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_KEY);
    } catch {
      // Browser storage is optional.
    }
    return resolveLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages);
  }

  private updateDocumentLanguage(locale: AppLocale): void {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }
}
