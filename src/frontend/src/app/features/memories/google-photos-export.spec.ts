import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventExport, EventPhoto, EventPhotos, PhotoBatch, PhotoExport } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { OPEN_EXTERNAL } from '../settings/google-calendar-settings';
import { EventPhotosSection } from './event-photos';
import { EXPORT_POLL_MS, exportLine, progressText } from './google-photos-export';
import { PHOTOS_NOW } from './photo-text';

// Synthetic family only: you are Alex, Sam is the co-parent.
const F = '/api/families/family-1';
const EVENT = `${F}/memories/events/soccer`;
const EXPORT = `${EVENT}/google-photos`;
const NOW = new Date('2026-10-12T20:00:00Z');

const photo = (id: string, overrides: Partial<EventPhoto> = {}): EventPhoto => ({
  id,
  position: 1,
  width: 1707,
  height: 2560,
  expiresAt: '2026-11-09T17:00:00Z',
  thumbnailUrl: `${F}/memories/photos/${id}/thumbnail`,
  url: `${F}/memories/photos/${id}`,
  downloadUrl: `${F}/memories/photos/${id}/download`,
  ...overrides,
});

const batch = (id: string, overrides: Partial<PhotoBatch> = {}): PhotoBatch => ({
  id,
  yours: true,
  visibleToCoParent: true,
  downloadsAllowed: true,
  createdAt: '2026-10-12T17:00:00Z',
  photos: [photo(`${id}-1`), photo(`${id}-2`, { position: 2 })],
  ...overrides,
});

// Two of yours, and two of Sam's shared photos that Sam hasn't allowed to be downloaded.
const photos = (overrides: Partial<EventPhotos> = {}): EventPhotos => ({
  eventId: 'soccer',
  title: 'Soccer final',
  startsAt: '2026-10-12T15:00:00Z',
  endsAt: '2026-10-12T17:00:00Z',
  allDay: false,
  cancelled: false,
  uploads: {
    available: true,
    blocked: null,
    cap: 10,
    used: 2,
    remaining: 8,
    storageUsedBytes: 38_000_000,
    storageLimitBytes: 250_000_000,
    maxPerUpload: 5,
    maxFileBytes: 20_000_000,
  },
  batches: [
    batch('mine'),
    batch('sams', {
      yours: false,
      downloadsAllowed: false,
      photos: [
        photo('sams-1', { downloadUrl: null }),
        photo('sams-2', { position: 2, downloadUrl: null }),
      ],
    }),
  ],
  photosDeletedOn: null,
  downloadAll: { photoCount: 2, bytes: 1_200_000, omitted: 2, url: `${EVENT}/download` },
  ...overrides,
});

const status = (overrides: Partial<EventExport> = {}): EventExport => ({
  available: true,
  connection: 'Connected',
  albumTitle: 'Soccer final · Oct 12, 2026',
  exportable: 2,
  exported: 0,
  waiting: 0,
  omitted: 2,
  photos: [],
  ...overrides,
});

const record = (photoId: string, overrides: Partial<PhotoExport> = {}): PhotoExport => ({
  photoId,
  state: 'Queued',
  reason: 'None',
  updatedAt: '2026-10-12T20:00:00Z',
  ...overrides,
});

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

function button(within: Element, label: string): HTMLButtonElement {
  const match = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => text(b) === label,
  );
  if (!match) {
    throw new Error(`No button "${label}" in: ${text(within)}`);
  }
  return match;
}

describe('export to Google Photos on a Family Memory (#404)', () => {
  let http: HttpTestingController;
  let opened: string[];
  let current: ComponentFixture<unknown> | null = null;

  async function settle(fixture: ComponentFixture<unknown>) {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render(answer: EventExport, view = photos()) {
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PHOTOS_NOW, useValue: () => NOW },
        { provide: EXPORT_POLL_MS, useValue: 10 },
        { provide: OPEN_EXTERNAL, useValue: (url: string) => opened.push(url) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EventPhotosSection);
    current = fixture;
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('eventId', 'soccer');
    fixture.componentRef.setInput('timeZone', 'America/Chicago');
    fixture.componentRef.setInput('coParent', 'Sam');
    fixture.componentRef.setInput('linkToMemory', false);
    fixture.componentRef.setInput('headingLevel', 2);
    fixture.componentRef.setInput('googlePhotos', true);
    fixture.detectChanges();
    http.expectOne(EVENT).flush(view);
    http.expectOne({ method: 'GET', url: EXPORT }).flush(answer);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Opening the sheet asks the server again, so the counts are current. */
  async function openSheet(
    fixture: ComponentFixture<unknown>,
    el: HTMLElement,
    answer: EventExport,
  ) {
    button(el, 'Export to Google Photos').click();
    http.expectOne({ method: 'GET', url: EXPORT }).flush(answer);
    await settle(fixture);
  }

  afterEach(() => {
    // Leaving the page stops the status checks; one may already be on its way.
    current?.destroy();
    current = null;
    http.match({ method: 'GET', url: EXPORT });
    http.verify();
  });

  it('offers export beside Download all, and says before starting what goes where and what stays', async () => {
    const { fixture, el } = await render(status());

    const offer = el.querySelector('.export')!;
    expect(button(offer, 'Export to Google Photos')).toBeTruthy();
    await openSheet(fixture, el, status());

    const sheet = el.querySelector('.export-sheet')!;
    expect(document.activeElement?.id).toBe('export-sheet-heading');
    expect(text(sheet)).toContain(
      '2 photos will go to the album “Soccer final · Oct 12, 2026” in your Google Photos.',
    );
    expect(text(sheet)).toContain(
      'Sam hasn’t allowed downloads of 2 of their photos, so they can’t be exported.',
    );
    expect(text(sheet)).toContain(
      'Copies use your Google storage. They stay in your Google Photos after these photos are deleted here on Nov 9; Parenthesis can’t recall them.',
    );
    expect(await axeViolations(el)).toEqual([]);

    button(sheet, 'Export 2 photos').click();
    const post = http.expectOne({ method: 'POST', url: EXPORT });
    expect(post.request.body).toEqual({ photoIds: null });
    post.flush(
      status({
        exportable: 0,
        waiting: 2,
        photos: [record('mine-1'), record('mine-2', { state: 'Checking' })],
      }),
    );
    await settle(fixture);

    expect(text(el.querySelector('.export-sheet'))).toContain(
      '0 of 2 in your Google Photos · 2 exporting',
    );
    expect(text(el)).toContain('Photo 1 Exporting…');
    expect(text(el)).toContain('Photo 2 Checking with Google…');
    // Nothing is marked as exported until the server says Google confirmed it.
    expect(el.querySelector('.tile__mark')).toBeNull();

    // While photos are on their way, the memory asks again; Google confirmed both.
    const poll = await vi.waitFor(() => http.expectOne({ method: 'GET', url: EXPORT }));
    poll.flush(
      status({
        exportable: 0,
        exported: 2,
        photos: [record('mine-1', { state: 'Exported' }), record('mine-2', { state: 'Exported' })],
      }),
    );
    await settle(fixture);

    expect(text(el.querySelector('.export-sheet'))).toContain('2 of 2 in your Google Photos');
    expect(el.querySelectorAll('.tile__mark')).toHaveLength(2);
    expect(el.querySelector('#photo-mine-1')!.getAttribute('aria-label')).toContain(
      ', in your Google Photos',
    );
    expect(text(el)).toContain('2 photos here are in your Google Photos.');

    // Nothing is waiting, so it stops asking.
    await new Promise((resolve) => setTimeout(resolve, 40));
    http.expectNone({ method: 'GET', url: EXPORT });

    button(el.querySelector('.export-sheet')!, 'Close').click();
    await settle(fixture);
    expect(el.querySelector('.export-sheet')).toBeNull();
    expect(document.activeElement?.id).toBe('export-open');
  });

  it('asks a parent who isn’t connected to connect first, and comes back to this memory', async () => {
    const { fixture, el } = await render(status({ connection: 'NotConnected' }));
    await openSheet(fixture, el, status({ connection: 'NotConnected' }));

    const sheet = el.querySelector('.export-sheet')!;
    expect(text(sheet)).toContain(
      'Connect your Google Photos first. You’ll come back here to export.',
    );
    expect(text(sheet)).toContain('Or use Download all to save them to this device.');
    expect(await axeViolations(el)).toEqual([]);

    button(sheet, 'Connect Google Photos').click();
    const authorize = http.expectOne({
      method: 'POST',
      url: `${F}/memories/google-photos/authorize`,
    });
    expect(authorize.request.body).toEqual({ returnEventId: 'soccer' });
    authorize.flush({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' });
    await settle(fixture);

    expect(opened).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?client_id=x']);
  });

  it('asks to reconnect when Google access was removed after the sheet opened', async () => {
    const { fixture, el } = await render(status());
    await openSheet(fixture, el, status());

    button(el.querySelector('.export-sheet')!, 'Export 2 photos').click();
    http
      .expectOne({ method: 'POST', url: EXPORT })
      .flush(
        { title: 'Google Photos needs you to reconnect.', reason: 'reconnect' },
        { status: 409, statusText: 'Conflict' },
      );
    await vi
      .waitFor(() => http.expectOne({ method: 'GET', url: EXPORT }))
      .then((r) =>
        r.flush(status({ connection: 'NeedsReconnect', waiting: 1, photos: [record('mine-1')] })),
      );
    await settle(fixture);

    const sheet = el.querySelector('.export-sheet')!;
    expect(sheet.querySelector('[role=alert]')!.textContent).toContain(
      'Google Photos needs you to reconnect.',
    );
    expect(text(sheet)).toContain('1 photo is waiting.');
    expect(button(sheet, 'Reconnect Google Photos')).toBeTruthy();
  });

  it('exports one photo from the viewer, and offers Try again when Google storage is full', async () => {
    const { fixture, el } = await render(status());

    el.querySelector<HTMLButtonElement>('#photo-mine-2')!.click();
    await settle(fixture);
    const viewer = el.querySelector('.viewer')!;
    expect(button(viewer, 'Export to Google Photos')).toBeTruthy();
    // The co-parent's photo they may not download can't be exported either.
    viewer.querySelector<HTMLButtonElement>('[aria-label="Close photo"]')!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('#photo-sams-1')!.click();
    await settle(fixture);
    expect(text(el.querySelector('.viewer'))).not.toContain('Export to Google Photos');
    el.querySelector<HTMLButtonElement>('.viewer [aria-label="Close photo"]')!.click();
    await settle(fixture);

    el.querySelector<HTMLButtonElement>('#photo-mine-2')!.click();
    await settle(fixture);
    button(el.querySelector('.viewer')!, 'Export to Google Photos').click();
    http.expectOne({ method: 'GET', url: EXPORT }).flush(status());
    await settle(fixture);

    const sheet = el.querySelector('.export-sheet')!;
    expect(text(sheet)).toContain('This photo will go to the album “Soccer final · Oct 12, 2026”');
    expect(text(sheet)).toContain(
      'It stays in your Google Photos after this photo is deleted here on Nov 9',
    );
    button(sheet, 'Export 1 photo').click();
    const post = http.expectOne({ method: 'POST', url: EXPORT });
    expect(post.request.body).toEqual({ photoIds: ['mine-2'] });
    post.flush(
      status({
        exportable: 1,
        photos: [record('mine-2', { state: 'Failed', reason: 'StorageFull' })],
      }),
    );
    await settle(fixture);

    const result = el.querySelector('.export-sheet')!;
    expect(text(result)).toContain('Not exported Photo 2');
    expect(text(result)).toContain(
      'Couldn’t export. Your Google storage is full. Free up space in your Google account, then try again.',
    );
    expect(text(result)).not.toContain('In your Google Photos ·');
    expect(await axeViolations(el)).toEqual([]);

    button(result, 'Try again (1)').click();
    const again = http.expectOne({ method: 'POST', url: EXPORT });
    expect(again.request.body).toEqual({ photoIds: ['mine-2'] });
    again.flush(status({ exportable: 1, waiting: 1, photos: [record('mine-2')] }));
    await settle(fixture);
    expect(text(el.querySelector('.export-sheet'))).toContain('Photo 2 Exporting…');

    button(el.querySelector('.export-sheet')!, 'Close').click();
    await settle(fixture);
    expect(document.activeElement?.id).toBe('photo-mine-2');
  });

  it('says why nothing can be exported, without offering a button that does nothing', async () => {
    const answer = status({
      exportable: 0,
      exported: 2,
      photos: [record('mine-1', { state: 'Exported' }), record('mine-2', { state: 'Exported' })],
    });
    const { fixture, el } = await render(answer);
    await openSheet(fixture, el, answer);

    const sheet = el.querySelector('.export-sheet')!;
    expect(text(sheet)).toContain('No photos here can be exported.');
    expect(text(sheet)).toContain('2 photos are already in your Google Photos and are skipped.');
    expect(text(sheet)).not.toContain('Export 0 photos');
  });

  it('says honestly when export isn’t set up on this server', async () => {
    const { el } = await render(status({ available: false }));

    expect(text(el)).toContain('Exporting to Google Photos isn’t available yet.');
    expect(text(el)).not.toContain('Export to Google Photos');
  });

  it('reminds parents to export, not only download, in the final week', async () => {
    const soon = photos({
      batches: [
        batch('mine', { photos: [photo('mine-1', { expiresAt: '2026-10-15T17:00:00Z' })] }),
      ],
    });
    const { el } = await render(status({ exportable: 1, omitted: 0 }), soon);

    expect(text(el)).toContain(
      'This photo is deleted in 3 days, on Oct 15. Download or export any you want to keep.',
    );
  });
});

describe('export status words (#404)', () => {
  it('never calls a photo exported unless Google confirmed it', () => {
    for (const state of ['Queued', 'Checking', 'Failed', 'Skipped'] as const) {
      expect(
        exportLine(record('p', { state, reason: 'GoogleError' }), 'Sam', 'Nov 9').text,
      ).not.toContain('In your Google Photos');
    }
    expect(exportLine(record('p', { state: 'Exported' }), 'Sam', null).text).toBe(
      'In your Google Photos',
    );
  });

  it('explains each reason plainly, and offers Try again only where it can help', () => {
    const line = (state: PhotoExport['state'], reason: PhotoExport['reason']) =>
      exportLine(record('p', { state, reason }), 'Sam', 'Nov 9');

    expect(line('Skipped', 'NotAllowed')).toEqual({
      kind: 'skipped',
      text: 'Not exported. Sam stopped sharing this photo or turned off downloads.',
      retry: false,
    });
    expect(line('Failed', 'Expired').text).toBe(
      'Couldn’t export. This photo expired before it was exported.',
    );
    expect(line('Failed', 'Expired').retry).toBe(false);
    expect(line('Skipped', 'Deleted').text).toBe('Not exported. This photo was deleted.');
    expect(line('Failed', 'GoogleError')).toEqual({
      kind: 'failed',
      text: 'Couldn’t export. Google Photos had a problem. Try again.',
      retry: true,
    });
    expect(line('Queued', 'RateLimited').text).toBe(
      'Waiting to export. Google is limiting exports right now. Parenthesis will keep trying until this photo is deleted on Nov 9.',
    );
  });

  it('sums up progress', () => {
    expect(
      progressText([
        record('a', { state: 'Exported' }),
        record('b', { state: 'Exported' }),
        record('c', { state: 'Exported' }),
        record('d'),
        record('e', { state: 'Failed', reason: 'GoogleError' }),
      ]),
    ).toBe('3 of 5 in your Google Photos · 1 exporting · 1 couldn’t export');
  });

  it('speaks Spanish when the parent chose it (#534)', () => {
    const line = (state: PhotoExport['state'], reason: PhotoExport['reason']) =>
      exportLine(record('p', { state, reason }), 'Sam', '9 nov', 'es-419');
    expect(exportLine(record('p', { state: 'Exported' }), 'Sam', null, 'es-419').text).toBe('En tu Google Fotos');
    expect(line('Skipped', 'NotAllowed').text).toBe(
      'No se exportó. Sam dejó de compartir esta foto o desactivó las descargas.',
    );
    expect(line('Queued', 'RateLimited').text).toContain('hasta que esta foto se elimine el 9 nov');
    expect(
      progressText([record('a', { state: 'Exported' }), record('b'), record('c', { state: 'Failed' })], 'es-419'),
    ).toBe('1 de 3 en tu Google Fotos · 1 exportándose · 1 no se pudieron exportar');
  });
});
