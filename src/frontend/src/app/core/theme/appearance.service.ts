import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

export const APPEARANCE_PREFERENCES: readonly AppearancePreference[] = ['light', 'dark', 'system'];

const STORAGE_PREFIX = 'parenthesis.appearance.';

/**
 * Each person's own Light / Dark / System choice (docs/design-system.md). It is never a family-wide setting and
 * never needs approval.
 *
 * Until profile settings persist it on the server, the choice is cached on this device under the signed-in user's
 * id, so one parent or child never inherits another account's choice. Signed out, the app follows the system.
 * Nothing but the theme name is stored.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  private readonly systemPrefersDark = signal(this.media?.matches ?? false);
  private readonly userId = signal<string | null>(null);

  readonly preference = signal<AppearancePreference>('system');

  readonly effectiveTheme = computed<EffectiveTheme>(() => {
    const preference = this.preference();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    // Only "System" follows OS changes; an explicit choice stays put.
    const onSystemChange = (event: MediaQueryListEvent) => this.systemPrefersDark.set(event.matches);
    this.media?.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onSystemChange));

    effect(() => this.apply(this.preference()));
  }

  /** Call when the signed-in account changes (null when signed out) to load that account's own choice. */
  useAccount(userId: string | null): void {
    this.userId.set(userId);
    this.preference.set(userId ? this.read(userId) : 'system');
  }

  setPreference(preference: AppearancePreference): void {
    this.preference.set(preference);
    const userId = this.userId();
    if (userId) {
      this.write(userId, preference);
    }
  }

  private apply(preference: AppearancePreference): void {
    const root = this.document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }

  private read(userId: string): AppearancePreference {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_PREFIX + userId);
      return APPEARANCE_PREFERENCES.includes(stored as AppearancePreference)
        ? (stored as AppearancePreference)
        : 'system';
    } catch {
      return 'system'; // Storage blocked (private mode, policy): fall back to the system.
    }
  }

  private write(userId: string, preference: AppearancePreference): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_PREFIX + userId, preference);
    } catch {
      // Storage blocked: the choice still applies for this session.
    }
  }
}
