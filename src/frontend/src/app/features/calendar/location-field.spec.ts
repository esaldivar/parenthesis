import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { LocationField, SUGGESTION_DELAY_MS } from './location-field';

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

  afterEach(() => {
    vi.useRealTimers();
  });

  const input = () => fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
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

  it('saves the picked suggestion’s text and starts a new session after it', async () => {
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
    await type(' 10 ');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS * 2);

    http.expectNone(URL);
  });

  it('stops asking once suggestions aren’t available, and stays a plain text field', async () => {
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
    await type('100 Example');
    vi.advanceTimersByTime(SUGGESTION_DELAY_MS);
    http.expectOne(URL).flush({ title: 'Server error' }, { status: 500, statusText: 'Server error' });
    await settle();

    expect(options()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('still shows the form’s own error for the field', async () => {
    fixture.componentInstance.error.set('Keep the location under 200 characters.');
    await settle();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Keep the location under 200 characters.');
  });
});
