import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleService } from './locale.service';
import { detectLocale, resolveLocale } from './locale.service';
import { translate, translations } from './translations';

describe('localization foundation (#534)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps parent choices separate when switching accounts on a shared device', () => {
    const service = new LocaleService();
    service.useAccount('parent-a');
    service.setLocale('es-419');
    service.useAccount('parent-b');
    service.setLocale('en');
    service.useAccount('parent-a');
    expect(service.locale()).toBe('es-419');
    service.useAccount('parent-b');
    expect(service.locale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('does not overwrite a signed-out language preference with an account preference', () => {
    const service = new LocaleService();
    service.setLocale('es-419');
    service.useAccount('parent-a');
    service.setLocale('en');
    service.useAccount(null);
    expect(service.locale()).toBe('es-419');
  });

  it('keeps the signed-out choice when an existing account has never saved a language', () => {
    const service = new LocaleService();
    service.setLocale('es-419');
    service.useAccount('existing-parent', null);
    expect(service.locale()).toBe('es-419');
    service.useAccount('other-parent', 'en');
    expect(service.locale()).toBe('en');
    service.useAccount(null);
    expect(service.locale()).toBe('es-419');
  });

  it('detects Spanish variants and otherwise falls back to English', () => {
    expect(detectLocale(['es-MX', 'en-US'])).toBe('es-419');
    expect(detectLocale(['en-US', 'es-MX'])).toBe('en');
    expect(detectLocale(['fr-FR'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('prefers an explicit supported selection', () => {
    expect(resolveLocale('es-419', ['en-US'])).toBe('es-419');
    expect(resolveLocale('en', ['es-MX'])).toBe('en');
    expect(resolveLocale('unsupported', ['es-AR'])).toBe('es-419');
  });

  it('keeps interpolation parameters in both languages', () => {
    const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const [key, [english, spanish]] of Object.entries(translations)) {
      expect(placeholders(spanish), key).toEqual(placeholders(english));
    }
  });

  it('provides nonempty English and Spanish strings for every catalog key', () => {
    for (const key of Object.keys(translations) as (keyof typeof translations)[]) {
      expect(translate(key, 'en').trim().length).toBeGreaterThan(0);
      expect(translate(key, 'es-419').trim().length).toBeGreaterThan(0);
    }
  });
});
