import { TestBed } from '@angular/core/testing';
import { AppearanceService } from './appearance.service';

type Listener = (event: MediaQueryListEvent) => void;

/** A controllable prefers-color-scheme media query. */
function fakeSystemTheme(prefersDark: boolean) {
  const listeners: Listener[] = [];
  const media = {
    matches: prefersDark,
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
    removeEventListener: () => undefined,
  };
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  return {
    change(dark: boolean) {
      media.matches = dark;
      listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
    },
  };
}

describe('AppearanceService', () => {
  const theme = () => document.documentElement.getAttribute('data-theme');

  function create(prefersDark = false) {
    const system = fakeSystemTheme(prefersDark);
    TestBed.configureTestingModule({});
    const service = TestBed.inject(AppearanceService);
    TestBed.tick();
    return { service, system };
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to System, which follows the device', () => {
    const { service } = create(true);

    expect(service.preference()).toBe('system');
    expect(service.effectiveTheme()).toBe('dark');
    expect(theme()).toBeNull();
  });

  it('applies an explicit choice to the document', () => {
    const { service } = create();
    service.useAccount('parent-a');

    service.setPreference('dark');
    TestBed.tick();

    expect(theme()).toBe('dark');
    expect(service.effectiveTheme()).toBe('dark');
  });

  it('follows OS changes only while System is selected', () => {
    const { service, system } = create(false);

    system.change(true);
    expect(service.effectiveTheme()).toBe('dark');

    service.setPreference('light');
    system.change(true);
    expect(service.effectiveTheme()).toBe('light');
  });

  it('keeps each account’s choice separate on a shared device', () => {
    const { service } = create();

    service.useAccount('parent-a');
    service.setPreference('dark');
    service.useAccount('child-b');

    expect(service.preference()).toBe('system');

    service.setPreference('light');
    service.useAccount('parent-a');

    expect(service.preference()).toBe('dark');
  });

  it('returns to System on sign-out and does not leak the last choice', () => {
    const { service } = create();
    service.useAccount('parent-a');
    service.setPreference('dark');

    service.useAccount(null);
    TestBed.tick();

    expect(service.preference()).toBe('system');
    expect(theme()).toBeNull();
  });

  it('stores only the theme name, and nothing while signed out', () => {
    const { service } = create();

    service.setPreference('dark');
    expect(localStorage.length).toBe(0);

    service.useAccount('parent-a');
    service.setPreference('light');
    expect(Object.keys(localStorage)).toEqual(['parenthesis.appearance.parent-a']);
    expect(localStorage.getItem('parenthesis.appearance.parent-a')).toBe('light');
  });

  it('ignores unexpected stored values', () => {
    localStorage.setItem('parenthesis.appearance.parent-a', '<script>');
    const { service } = create();

    service.useAccount('parent-a');

    expect(service.preference()).toBe('system');
  });
});
