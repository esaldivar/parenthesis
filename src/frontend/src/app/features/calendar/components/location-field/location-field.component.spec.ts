import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { axeViolations } from '../../../../../testing/axe';
import { fakeAuth } from '../../../../../testing/fake-auth';
import { translate } from '../../../../core/i18n/translations';
import { LOCATION_OPTIONS, LocationField, SUGGESTION_DELAY_MS } from './location-field.component';

// Synthetic addresses only. Google is never called: the API answers in its place.
const URL = '/api/families/family-1/calendar/place-suggestions';

@Component({
  imports: [LocationField],
  template: `<app-location-field [control]="control" [error]="error()" />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
  readonly error = signal<string | null>(null);
}

describe('the location field’s address suggestions (#354)', () => {
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), fakeAuth()] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
  });

  /** The field first checks whether suggestions are on. That check never reaches Google. */
  async function start(available = true) {
    const check = http.expectOne({ method: 'GET', url: URL });
    check.flush({ suggestions: [], available });
    await settle();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  const input = () => fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
  const nearbyButton = () => fixture.nativeElement.querySelector('button.nearby') as HTMLButtonElement | null;
  const options = () => [...document.querySelectorAll<HTMLElement>('mat-option')].map((o) => o.textContent!.trim());

  async function type(value: string) {
    input().focus();
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  it('asks once after typing pauses and offers what comes back, with Google’s attribution', async () => {
    await start();
    await type('100 Ex');
    await type('100 Example');
    http.expectNone(URL);
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.input).toBe('100 Example');
    expect(request.request.body.sessionToken).toMatch(/^[0-9a-f-]{36}$/);
    request.flush({ suggestions: ['100 Example Ave, Springfield, IL, USA', 'Example Park, Springfield, IL, USA'], available: true });
    await settle();

    expect(options()).toEqual(['100 Example Ave, Springfield, IL, USA', 'Example Park, Springfield, IL, USA']);
    expect(document.querySelector('.attribution')!.textContent!.trim()).toBe('Google Maps');
    expect(input().getAttribute('role')).toBe('combobox');
    vi.useRealTimers();
    // The field, and the suggestion list in its overlay (tested apart from the app's landmarks).
    expect(await axeViolations(fixture.nativeElement)).toEqual([]);
    expect(await axeViolations(document.querySelector<HTMLElement>('.cdk-overlay-container')!)).toEqual([]);
  });

  it('mentions Google only after the server confirms suggestions are on', async () => {
    const sr = 'Address suggestions come from Google Maps.';
    expect(fixture.nativeElement.textContent).not.toContain(sr);

    await start();

    expect(fixture.nativeElement.textContent).toContain(sr);
  });

  it('stays a plain text field, with no location button, when suggestions are off', async () => {
    await start(false);

    expect(fixture.nativeElement.textContent).not.toContain('Address suggestions come from Google Maps.');
    expect(nearbyButton()).toBeNull();
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    http.expectNone(URL);
  });

  it('saves the picked suggestion’s text and starts a new session after it', async () => {
    await start();
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const first = http.expectOne(URL);
    const session = first.request.body.sessionToken;
    first.flush({ suggestions: ['100 Example Ave, Springfield, IL, USA'], available: true });
    await settle();

    document.querySelector<HTMLElement>('mat-option')!.click();
    await settle();
    expect(fixture.componentInstance.control.value).toBe('100 Example Ave, Springfield, IL, USA');

    await type('Example Park');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    expect(http.expectOne(URL).request.body.sessionToken).not.toBe(session);
  });

  it('keeps one session while a parent keeps typing', async () => {
    await start();
    await type('100 Exa');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const first = http.expectOne(URL);
    first.flush({ suggestions: [], available: true });
    await settle();
    await type('100 Example Av');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);

    expect(http.expectOne(URL).request.body.sessionToken).toBe(first.request.body.sessionToken);
  });

  it('never asks for fewer than three characters', async () => {
    await start();
    await type(' 10 ');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS * 2);

    expect(() => http.expectNone(URL)).not.toThrow();
  });

  it('stops asking once suggestions aren’t available, and stays a plain text field', async () => {
    await start();
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    http.expectOne(URL).flush({ suggestions: [], available: false });
    await settle();

    await type('100 Example Ave');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    http.expectNone(URL);
    expect(fixture.componentInstance.control.value).toBe('100 Example Ave');
    expect(fixture.nativeElement.textContent).not.toContain('Address suggestions come from Google Maps.');
  });

  it('ignores an older answer that arrives after a newer request', async () => {
    await start();
    await type('100 Exa');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const older = http.expectOne(URL);
    await type('Example Park');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const newer = http.expectOne(URL);

    newer.flush({ suggestions: ['Example Park, Springfield, IL, USA'], available: true });
    older.flush({ suggestions: ['100 Example Ave, Springfield, IL, USA'], available: true });
    await settle();

    expect(options()).toEqual(['Example Park, Springfield, IL, USA']);
  });

  it('shows nothing and no error when the request fails', async () => {
    await start();
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    http.expectOne(URL).flush({ title: 'Server error' }, { status: 500, statusText: 'Server error' });
    await settle();

    expect(options()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('still shows the form’s own error for the field', async () => {
    await start();
    fixture.componentInstance.error.set('Keep the location under 200 characters.');
    await settle();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Keep the location under 200 characters.');
  });
});

describe('“Use my location” for nearby suggestions (#414)', () => {
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;
  let getCurrentPosition: ReturnType<typeof vi.fn>;
  let original: PropertyDescriptor | undefined;

  const AUSTIN = { latitude: 30.267153, longitude: -97.743057 }; // Synthetic: a city centre, not a home.

  beforeEach(async () => {
    vi.useFakeTimers();
    getCurrentPosition = vi.fn();
    original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), fakeAuth()] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url: URL }).flush({ suggestions: [], available: true });
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (original) {
      Object.defineProperty(navigator, 'geolocation', original);
    } else {
      delete (navigator as { geolocation?: unknown }).geolocation;
    }
  });

  const input = () => fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
  const button = () => fixture.nativeElement.querySelector('button.nearby') as HTMLButtonElement;
  const status = () => (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent!.trim();

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function type(value: string) {
    input().focus();
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function succeed(coords = AUSTIN) {
    const [onSuccess] = getCurrentPosition.mock.calls.at(-1)!;
    onSuccess({ coords });
    fixture.detectChanges();
  }

  function fail(code: number) {
    const [, onError] = getCurrentPosition.mock.calls.at(-1)!;
    onError({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    fixture.detectChanges();
  }

  it('is a labelled toggle beside the field that asks the browser only when pressed', async () => {
    expect(button().textContent!.trim()).toBe('Use my location');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(getCurrentPosition).not.toHaveBeenCalled();

    button().click();
    fixture.detectChanges();

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getCurrentPosition.mock.calls[0][2]).toEqual(LOCATION_OPTIONS);
    expect(status()).toBe('Finding your location…');
    expect(button().disabled).toBe(true);
    vi.useRealTimers();
    expect(await axeViolations(fixture.nativeElement)).toEqual([]);
  });

  it('favours nearby places by sending the position with the parent’s own searches, and re-sorts what’s typed', async () => {
    await type('Example Roadhouse');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const before = http.expectOne(URL);
    expect(before.request.body.latitude).toBeUndefined();
    before.flush({ suggestions: ['Example Roadhouse, Bismarck, ND, USA'], available: true });
    await settle();

    button().click();
    succeed();
    expect(status()).toBe(translate('calendar.location.on', 'en'));
    expect(button().getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);

    const after = http.expectOne(URL);
    expect(after.request.body).toMatchObject({ input: 'Example Roadhouse', ...AUSTIN });
    after.flush({ suggestions: ['Example Roadhouse, Austin, TX, USA'], available: true });
    await settle();
    expect([...document.querySelectorAll('mat-option')].map((o) => o.textContent!.trim())).toEqual([
      'Example Roadhouse, Austin, TX, USA',
    ]);
    // Nothing about the position reaches the form, so it's never saved with the event or shown to the co-parent.
    expect(fixture.componentInstance.control.value).toBe('Example Roadhouse');
  });

  it('turns off when pressed again, and stops sending the position', async () => {
    button().click();
    succeed();
    button().click();
    fixture.detectChanges();

    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(status()).toBe(translate('calendar.location.stopped', 'en'));
    await type('Example Park');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    expect(http.expectOne(URL).request.body.latitude).toBeUndefined();
  });

  it.each([
    [1, translate('calendar.location.denied', 'en')],
    [2, translate('calendar.location.unavailable', 'en')],
    [3, translate('calendar.location.unavailable', 'en')],
  ])('explains the fallback when the browser answers error %i, and typing still works', async (code, message) => {
    button().click();
    fail(code);

    expect(status()).toBe(message);
    expect(status()).toContain('You can still type any address.');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().disabled).toBe(false);
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    const request = http.expectOne(URL);
    expect(request.request.body.latitude).toBeUndefined();
    request.flush({ suggestions: ['100 Example Ave, Springfield, IL, USA'], available: true });
    await settle();
    expect(fixture.componentInstance.control.value).toBe('100 Example');
  });
});
