import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { GooglePhotosStatus } from '../../../../core/api/api';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { Toasts } from '../../../../shared/components/toast/toasts';
import { axeViolations } from '../../../../../testing/axe';
import { fakeAuth } from '../../../../../testing/fake-auth';
import { OPEN_EXTERNAL } from '../google-calendar-settings/google-calendar-settings.component';
import { GooglePhotosSettings } from './google-photos-settings.component';

// Synthetic family only: you are Alex, Sam is the co-parent.
const PATH = '/api/families/family-1/memories/google-photos';

const status = (overrides: Partial<GooglePhotosStatus> = {}): GooglePhotosStatus => ({
  available: true,
  state: 'NotConnected',
  problem: 'None',
  connectedAt: null,
  exportedCount: 0,
  albumCount: 0,
  waitingCount: 0,
  returnEventId: null,
  ...overrides,
});

const text = (element: Element) => element.textContent!.replace(/\s+/g, ' ');

function button(within: Element, label: string): HTMLButtonElement {
  const match = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent!.replace(/\s+/g, ' ').trim() === label,
  );
  if (!match) {
    throw new Error(`No button "${label}" in: ${text(within)}`);
  }
  return match;
}

describe('Google Photos settings (#404)', () => {
  let http: HttpTestingController;
  let opened: string[];
  let toasts: string[];

  async function render(answer: GooglePhotosStatus) {
    opened = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OPEN_EXTERNAL, useValue: (url: string) => opened.push(url) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Toasts).show = (message: string) => {
      toasts.push(message);
    };
    const fixture = TestBed.createComponent(GooglePhotosSettings);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('coParent', 'Sam');
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

    expect(text(element)).toContain('Exporting to Google Photos isn’t available yet.');
    expect(element.querySelector('button')).toBeNull();
  });

  it('says what is shared before Google’s page, then sends the parent there', async () => {
    const fixture = await render(status());
    const element = fixture.nativeElement as HTMLElement;

    expect(text(element)).toContain('one album per event');
    expect(text(element)).toContain('Only photos you choose are sent');
    expect(text(element)).toContain('can’t see anything else in your Google Photos');
    expect(text(element)).toContain('Parenthesis can’t recall or delete them');
    expect(text(element)).toContain('Connecting changes nothing for Sam.');
    expect(await axeViolations(element)).toEqual([]);

    button(element, 'Connect Google Photos').click();
    const authorize = http.expectOne({ method: 'POST', url: `${PATH}/authorize` });
    expect(authorize.request.body).toEqual({ returnEventId: null });
    authorize.flush({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' });
    await settle(fixture);

    expect(opened).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?client_id=x']);
  });

  it('shows what a connection has exported, and disconnects only after saying what stays', async () => {
    const fixture = await render(
      status({ state: 'Connected', exportedCount: 18, albumCount: 3, waitingCount: 1 }),
    );
    const element = fixture.nativeElement as HTMLElement;

    expect(text(element)).toContain(
      'Connected. 18 photos exported to 3 albums. 1 photo waiting to export.',
    );
    expect(element.querySelector('button[mat-flat-button]')).toBeNull();

    button(element, 'Disconnect…').click();
    await settle(fixture);
    expect(text(element)).toContain('Albums and photos already in your Google Photos stay there.');
    expect(text(element)).toContain('1 photo waiting to export won’t be sent.');
    expect(text(element)).toContain('new exports make new albums');
    expect(await axeViolations(element)).toEqual([]);

    button(element, 'Disconnect').click();
    http
      .expectOne({ method: 'DELETE', url: PATH })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(button(element, 'Connect Google Photos')).toBeTruthy();
    expect(toasts).toEqual([
      'Google Photos is disconnected. What’s already there stays in your Google Photos.',
    ]);
  });

  it('says what was exported in Spanish when the parent chose it (#534)', async () => {
    const fixture = await render(status({ state: 'Connected', exportedCount: 6, albumCount: 2, waitingCount: 1 }));
    const locale = TestBed.inject(LocaleService);
    try {
      locale.setLocale('es-419');
      await settle(fixture);
      const element = fixture.nativeElement as HTMLElement;
      expect(text(element)).toContain('6 fotos exportadas a 2 álbumes.');
      expect(text(element)).toContain('1 foto pendiente de exportar.');
      expect(text(element)).not.toContain('exported to');
    } finally {
      locale.setLocale('en');
    }
  });

  it('cancelling the disconnect question keeps the connection', async () => {
    const fixture = await render(status({ state: 'Connected', exportedCount: 1, albumCount: 1 }));
    const element = fixture.nativeElement as HTMLElement;

    button(element, 'Disconnect…').click();
    await settle(fixture);
    button(element, 'Cancel').click();
    await settle(fixture);

    expect(text(element)).toContain('Connected. 1 photo exported to 1 album.');
    http.expectNone({ method: 'DELETE', url: PATH });
  });

  it('asks the parent to reconnect when access was removed, saying what waits', async () => {
    const fixture = await render(
      status({ state: 'NeedsReconnect', problem: 'AccessRevoked', waitingCount: 2 }),
    );
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role=alert]')!.textContent).toContain(
      'Google Photos needs you to reconnect.',
    );
    expect(text(element)).toContain('so 2 photos are waiting. They’ll wait until they expire.');
    expect(button(element, 'Reconnect Google Photos')).toBeTruthy();
    expect(button(element, 'Disconnect…')).toBeTruthy();
    expect(await axeViolations(element)).toEqual([]);
  });

  it('shows a failure to start connecting next to the button', async () => {
    const fixture = await render(status());
    const element = fixture.nativeElement as HTMLElement;

    button(element, 'Connect Google Photos').click();
    http
      .expectOne(`${PATH}/authorize`)
      .flush(
        { title: 'Google Photos isn’t available yet.', reason: 'unavailable' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(fixture);

    expect(element.querySelector('[role=alert]')!.textContent).toContain(
      'Google Photos isn’t available yet.',
    );
    expect(opened).toEqual([]);
  });
});

describe('Google Photos callback (#404)', () => {
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
    return RouterTestingHarness.create(url);
  }

  it('finishes connecting, then returns to the memory the parent started from', async () => {
    const harness = await arrive('/settings/google-photos?code=one-time-code&state=signed-state');
    const shown = vi.spyOn(TestBed.inject(Toasts), 'show');

    const connect = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: `${PATH}/connect` }),
    );
    expect(connect.request.body).toEqual({ code: 'one-time-code', state: 'signed-state' });
    expect(harness.routeNativeElement?.textContent).toContain('Connecting Google Photos…');
    connect.flush(status({ state: 'Connected', returnEventId: 'soccer' }));

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/memories/soccer'));
    expect(shown).toHaveBeenCalledWith('Google Photos is connected.');
  });

  it('returns to Settings when the parent started there', async () => {
    await arrive('/settings/google-photos?code=one-time-code&state=signed-state');
    const connect = await vi.waitFor(() => http.expectOne(`${PATH}/connect`));
    connect.flush(status({ state: 'Connected' }));

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/settings'));
  });

  it('explains when access wasn’t allowed on Google’s page, without calling the API', async () => {
    const harness = await arrive('/settings/google-photos?error=access_denied&state=signed-state');
    await vi.waitFor(() =>
      expect(harness.routeNativeElement?.querySelector('[role=alert]')).toBeTruthy(),
    );

    expect(harness.routeNativeElement!.textContent).toContain('access wasn’t allowed');
    expect(await axeViolations(harness.routeNativeElement!)).toEqual([]);
    http.expectNone(`${PATH}/connect`);
  });

  it('shows the server’s reason when Google didn’t allow adding photos', async () => {
    const harness = await arrive('/settings/google-photos?code=one-time-code&state=signed-state');
    const connect = await vi.waitFor(() => http.expectOne(`${PATH}/connect`));
    connect.flush(
      {
        errors: {
          code: [
            "Google didn't give Parenthesis access to add photos. Try again and allow Google Photos access.",
          ],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() =>
      expect(harness.routeNativeElement?.querySelector('[role=alert]')).toBeTruthy(),
    );
    expect(harness.routeNativeElement!.textContent).toContain('access to add photos');
  });
});
