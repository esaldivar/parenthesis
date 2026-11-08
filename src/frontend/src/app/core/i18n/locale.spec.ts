import { describe, expect, it } from 'vitest';
import { detectLocale, resolveLocale } from './locale.service';
import { translate, translations } from './translations';

describe('localization foundation (#534)', () => {
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

  it('provides nonempty English and Spanish strings for every catalog key', () => {
    for (const key of Object.keys(translations) as (keyof typeof translations)[]) {
      expect(translate(key, 'en').trim().length).toBeGreaterThan(0);
      expect(translate(key, 'es-419').trim().length).toBeGreaterThan(0);
    }
  });
});
