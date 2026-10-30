import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { GoogleCalendarStatus } from '../../core/api/api';
import { Toasts } from '../../shared/toast/toasts';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { GoogleCalendarSettings, OPEN_EXTERNAL } from './google-calendar-settings';

// Synthetic family only.
const PATH = '/api/families/family-1/google-calendar';

const status = (overrides: Partial<GoogleCalendarStatus> = {}): GoogleCalendarStatus => ({
  available: true,
  state: 'NotConnected',
  problem: 'None',
  calendarName: 'Parenthesis Family',
  connectedAt: null,
  lastSyncedAt: null,
  copyTypes: [
    'ParentingTime',
    'Joint',
    'School',
    'Medical',
    'Dental',
    'Activity',
    'Birthday',
    'Holiday',
    'Other',
    'MyUnavailable',
  ],
  ...overrides,
});

const text = (element: Element) => element.textContent!.replace(/\s+/g, ' ');

function button(within: Element, label: string): HTMLButtonElement {
  const match = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent!.trim() === label,
  );
  if (!match) {
    throw new Error(`No button "${label}" in: ${text(within)}`);
  }
  return match;
}

describe('Google Calendar settings (#386)', () => {
  let http: HttpTestingController;
  let opened: string[];

  async function render(answer: GoogleCalendarStatus) {
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OPEN_EXTERNAL, useValue: (url: string) => opened.push(url) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GoogleCalendarSettings);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.detectChanges();
    http.expectOne(PATH).flush(answer);
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  afterEach(() => http.verify());

  it('says honestly when the server isn’t set up, and offers nothing', async () => {
    const fixture = await render(status({ available: false }));
    const element = fixture.nativeElement as HTMLElement;

    expect(text(element)).toContain('isn’t available yet');
    expect(element.querySelectorAll('button')).toHaveLength(0);
  });

  it('explains the one-way copy and sends the parent to Google to connect', async () => {
    const fixture = await render(status());
    const element = fixture.nativeElement as HTMLElement;

    expect(text(element)).toContain('Parenthesis never reads your Google Calendar');
    expect(text(element)).toContain('Requests still waiting for approval aren’t copied');
    expect(text(element)).toContain('“Parenthesis Family”');
    expect(await axeViolations(element)).toEqual([]);

    button(element, 'Connect Google Calendar').click();
    http
      .expectOne({ method: 'POST', url: `${PATH}/authorize` })
      .flush({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
    await settle(fixture);

    expect(opened).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?state=s']);
  });

  it('shows when a connected copy last ran, and disconnects only after confirming', async () => {
    const fixture = await render(
      status({
        state: 'Connected',
        connectedAt: '2026-10-30T15:00:00Z',
        lastSyncedAt: '2026-10-30T15:01:00Z',
      }),
    );
    const element = fixture.nativeElement as HTMLElement;
    const toasts = TestBed.inject(Toasts);
    const shown = vi.spyOn(toasts, 'show');

    expect(text(element)).toContain('Connected.');
    expect(text(element)).toContain('Last updated');
    expect(() => button(element, 'Connect Google Calendar')).toThrow();

    button(element, 'Disconnect…').click();
    await settle(fixture);
    expect(text(element)).toContain(
      'removes the “Parenthesis Family” calendar from your Google account',
    );
    expect(text(element)).toContain('Your other Google calendars aren’t touched.');
    expect(await axeViolations(element)).toEqual([]);
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('google-disconnect-heading'));

    button(element, 'Disconnect').click();
    http
      .expectOne({ method: 'DELETE', url: PATH })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(shown).toHaveBeenCalledWith('Google Calendar is disconnected.');
    expect(button(element, 'Connect Google Calendar')).toBeTruthy();
  });

  it('cancelling the disconnect question keeps the connection', async () => {
    const fixture = await render(
      status({ state: 'Connected', connectedAt: '2026-10-30T15:00:00Z' }),
    );
    const element = fixture.nativeElement as HTMLElement;

    expect(text(element)).toContain(
      'Your events will appear in Google Calendar in a minute or two.',
    );
    button(element, 'Disconnect…').click();
    await settle(fixture);
    button(element, 'Cancel').click();
    await settle(fixture);

    expect(button(element, 'Disconnect…')).toBeTruthy();
  });

  it('lets a connected parent choose which kinds of event to copy, and keeps the saved choice if saving fails', async () => {
    const fixture = await render(
      status({ state: 'Connected', connectedAt: '2026-10-30T15:00:00Z' }),
    );
    const element = fixture.nativeElement as HTMLElement;
    const box = (label: string) =>
      [...element.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((i) =>
        i.closest('mat-checkbox')!.textContent!.includes(label),
      )!;

    expect(element.querySelector('legend')!.textContent).toContain('Events to copy');
    expect(box('Parenting time').checked).toBe(true);
    expect(box('co-parent’s unavailable time').checked).toBe(false);
    expect(await axeViolations(element)).toEqual([]);

    box('Medical').click();
    const save = http.expectOne({ method: 'PUT', url: `${PATH}/copy-types` });
    expect(save.request.body.copyTypes).not.toContain('Medical');
    save.flush(status({ state: 'Connected', copyTypes: ['ParentingTime', 'School'] }));
    await settle(fixture);

    expect(box('Medical').checked).toBe(false);
    expect(box('Family events').checked).toBe(false);
    expect(text(element)).toContain('Saved.');

    box('Holidays').click();
    await settle(fixture);
    http.expectOne(`${PATH}/copy-types`).flush({}, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(box('Holidays').checked).toBe(false);
    expect(element.querySelector('[role=alert]')).toBeTruthy();
  });

  it('shows no choices before the parent connects', async () => {
    const fixture = await render(status());

    expect((fixture.nativeElement as HTMLElement).querySelector('fieldset')).toBeNull();
  });

  it.each([
    ['AccessRevoked', 'can’t reach your Google Calendar any more'],
    ['CalendarRemoved', 'was deleted in Google Calendar'],
  ] as const)(
    'explains a stopped copy (%s) and offers to reconnect',
    async (problem, explanation) => {
      const fixture = await render(
        status({ state: 'NeedsReconnect', problem, connectedAt: '2026-10-30T15:00:00Z' }),
      );
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('[role=alert]')!.textContent).toContain(explanation);
      expect(button(element, 'Reconnect Google Calendar')).toBeTruthy();
      expect(button(element, 'Disconnect…')).toBeTruthy();
    },
  );

  it('shows a failure to start connecting next to the button', async () => {
    const fixture = await render(status());
    const element = fixture.nativeElement as HTMLElement;

    button(element, 'Connect Google Calendar').click();
    http
      .expectOne(`${PATH}/authorize`)
      .flush(
        { title: 'Google Calendar isn’t available yet.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(fixture);

    expect(element.querySelector('[role=alert]')!.textContent).toContain(
      'Google Calendar isn’t available yet.',
    );
    expect(opened).toEqual([]);
  });
});

describe('Google Calendar callback (#386)', () => {
  let http: HttpTestingController;

  async function arrive(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        fakeAuth(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create(url);
    return harness;
  }

  it('finishes connecting with the code and state, then returns to Settings with a confirmation', async () => {
    const harness = await arrive(
      '/settings/google-calendar?code=one-time-code&state=signed-state&scope=x',
    );
    const shown = vi.spyOn(TestBed.inject(Toasts), 'show');

    const connect = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: `${PATH}/connect` }),
    );
    expect(connect.request.body).toEqual({ code: 'one-time-code', state: 'signed-state' });
    expect(harness.routeNativeElement?.textContent).toContain('Connecting Google Calendar…');
    connect.flush(status({ state: 'Connected' }));

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/settings'));
    await vi.waitFor(() =>
      expect(shown).toHaveBeenCalledWith(expect.stringContaining('Google Calendar is connected.')),
    );
  });

  it('explains when access wasn’t allowed on Google’s page, without calling the API', async () => {
    const harness = await arrive(
      '/settings/google-calendar?error=access_denied&state=signed-state',
    );
    await vi.waitFor(() =>
      expect(harness.routeNativeElement?.querySelector('[role=alert]')).toBeTruthy(),
    );

    expect(harness.routeNativeElement!.textContent).toContain('access wasn’t allowed');
    expect(
      harness
        .routeNativeElement!.querySelector('app-google-calendar-callback a')!
        .getAttribute('href'),
    ).toBe('/settings');
    expect(await axeViolations(harness.routeNativeElement!)).toEqual([]);
    http.expectNone(`${PATH}/connect`);
  });

  it('shows the server’s reason when the link has expired or isn’t this parent’s', async () => {
    const harness = await arrive('/settings/google-calendar?code=one-time-code&state=old');
    const connect = await vi.waitFor(() => http.expectOne(`${PATH}/connect`));
    connect.flush(
      {
        errors: {
          state: [
            "This Google sign-in link has expired or isn't yours. Start again from Settings.",
          ],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(harness.routeNativeElement?.querySelector('[role=alert]')).toBeTruthy(),
    );
    expect(harness.routeNativeElement!.textContent).toContain("has expired or isn't yours");
  });
});
