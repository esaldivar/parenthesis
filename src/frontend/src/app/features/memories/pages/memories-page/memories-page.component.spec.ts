import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventPhotos, Memory } from '../../../../core/api/api';
import { axeViolations } from '../../../../../testing/axe';
import { MEMBERS } from '../../../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../../../testing/fake-auth';
import { MemoriesPage } from './memories-page.component';
import { MemoryPage } from '../memory-page/memory-page.component';
import { PHOTOS_NOW } from '../../photo-text';

// Synthetic family only: you are Alex, Sam is the co-parent.
const F = '/api/families/family-1';
const FAMILY = {
  id: 'family-1',
  name: 'Rivera Family',
  timeZone: 'America/Chicago',
  createdAt: '2026-10-01T00:00:00Z',
  members: MEMBERS,
};
const NOW = new Date('2026-11-06T18:00:00Z');

const memory = (eventId: string, overrides: Partial<Memory> = {}): Memory => ({
  eventId,
  title: 'Soccer final',
  startsAt: '2026-10-12T15:00:00Z',
  endsAt: '2026-10-12T17:00:00Z',
  allDay: false,
  cancelled: false,
  photoCount: 7,
  yourPhotoCount: 4,
  sharedWithYouCount: 3,
  expiresAt: '2026-11-09T17:00:00Z',
  coverThumbnailUrl: `${F}/memories/photos/${eventId}-1/thumbnail`,
  ...overrides,
});

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 4; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

describe('Family Memories (#403)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        fakeAuth(),
        { provide: PHOTOS_NOW, useValue: () => NOW },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function renderList() {
    const fixture = TestBed.createComponent(MemoriesPage);
    fixture.detectChanges();
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists one memory per event, newest first, with whose photos and when they go', async () => {
    const { fixture, el } = await renderList();
    http
      .expectOne(`${F}/memories`)
      .flush([
        memory('science', {
          title: 'Science fair',
          startsAt: '2026-10-28T15:00:00Z',
          photoCount: 5,
          yourPhotoCount: 0,
          sharedWithYouCount: 5,
          expiresAt: '2026-11-25T17:00:00Z',
        }),
        memory('soccer'),
      ]);
    http.expectOne(F).flush(FAMILY);
    await settle(fixture);

    const rows = [...el.querySelectorAll('.memory')];
    expect(text(el.querySelector('header h1'))).toBe('Family Memories');
    expect(text(el.querySelector('header .tagline'))).toBe('The little things are worth remembering.');
    expect(el.querySelector('.memories-header__art')?.getAttribute('aria-hidden')).toBe('true');
    expect(rows.map(text)).toEqual([
      'Science fair.Oct 28 · 5 photos · Sam.Deleted Nov 25',
      'Soccer final.Oct 12 · 7 photos · You and Sam.Deleted in 3 days. Open to save photosSave photos',
    ]);
    expect(rows[1].getAttribute('href')).toBe('/memories/soccer');
    expect(rows[1].querySelector('.chip')!.getAttribute('data-soon')).toBe('true');
    // #717: one month heading here, a time-left bar and the save cue only in the final week, and no nested controls.
    expect([...el.querySelectorAll('.month h2')].map(text)).toEqual(['October 2026']);
    expect(rows[0].querySelector('app-time-left, .save-cue')).toBeNull();
    expect(rows[1].querySelector('app-time-left')).not.toBeNull();
    expect(rows.every((row) => row.querySelector('a, button') === null)).toBe(true);
    expect(rows[1].querySelector('app-memory-cover img')!.getAttribute('src')).toBe(`${F}/memories/photos/soccer-1/thumbnail`);
    expect(text(el)).toContain(
      'Each photo is deleted 28 days after it’s added, so download the ones you want to keep.',
    );
    expect(await axeViolations(el)).toEqual([]);
  });

  it('groups memories by month on the timeline and marks the one deleted soonest (#717)', async () => {
    const { fixture, el } = await renderList();
    http.expectOne(`${F}/memories`).flush([
      memory('beach', { title: 'Beach day', startsAt: '2026-11-03T15:00:00Z', expiresAt: '2026-12-01T17:00:00Z' }),
      memory('chalk', { title: 'Chalk art', startsAt: '2026-10-31T15:00:00Z', expiresAt: '2026-11-11T17:00:00Z' }),
      memory('picnic', { title: 'Picnic', startsAt: '2026-10-26T15:00:00Z', expiresAt: '2026-11-07T17:00:00Z' }),
    ]);
    http.expectOne(F).flush(FAMILY);
    await settle(fixture);

    const months = [...el.querySelectorAll('.month')];
    expect(months.map((m) => text(m.querySelector('h2')))).toEqual(['November 2026', 'October 2026']);
    expect(months.map((m) => m.querySelectorAll('.memory').length)).toEqual([1, 2]);
    expect(months[0].getAttribute('aria-labelledby')).toBe(months[0].querySelector('h2')!.id);
    const dots = [...el.querySelectorAll('.entry__dot')].map((d) => d.getAttribute('data-soonest'));
    expect(dots).toEqual(['false', 'false', 'true']);
    expect(text(el.querySelectorAll('.memory')[2].querySelector('.chip'))).toBe('Deleted tomorrow');
    expect(await axeViolations(el)).toEqual([]);
  });

  it('says honestly when there are no memories yet', async () => {
    const { fixture, el } = await renderList();
    http.expectOne(`${F}/memories`).flush([]);
    http.expectOne(F).flush(FAMILY);
    await settle(fixture);

    expect(text(el)).toContain('No memories yet');
    expect(text(el)).toContain(
      'Add photos to a confirmed event on the calendar and they’ll show here.',
    );
    expect(el.querySelector('a[href="/calendar"]')).not.toBeNull();
    expect(el.querySelector('.empty__sheets')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(el.querySelector('.empty h2'))).toBe('No memories yet');
  });

  it('offers to try again when memories can’t load', async () => {
    const { fixture, el } = await renderList();
    http.expectOne(`${F}/memories`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(F).flush(FAMILY);
    await settle(fixture);

    expect(text(el.querySelector('[role=alert]'))).toContain('Memories couldn’t load.');
    [...el.querySelectorAll('button')].find((b) => text(b) === 'Try again')!.click();
    await settle(fixture);
    http.expectOne(`${F}/memories`).flush([]);
    http.expectOne(F).flush(FAMILY);
    await settle(fixture);
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  describe('one memory', () => {
    const photos = (overrides: Partial<EventPhotos> = {}): EventPhotos => ({
      eventId: 'soccer',
      title: 'Soccer final',
      startsAt: '2026-10-12T15:00:00Z',
      endsAt: '2026-10-12T17:00:00Z',
      allDay: false,
      cancelled: false,
      uploads: {
        available: true,
        blocked: 'window-closed',
        cap: 10,
        used: 1,
        remaining: 9,
        storageUsedBytes: 0,
        storageLimitBytes: 250_000_000,
        maxPerUpload: 5,
        maxFileBytes: 20_000_000,
      },
      batches: [
        {
          id: 'mine',
          yours: true,
          visibleToCoParent: true,
          downloadsAllowed: true,
          createdAt: '2026-10-12T17:00:00Z',
          photos: [
            {
              id: 'p1',
              position: 1,
              width: 10,
              height: 10,
              expiresAt: '2026-11-09T17:00:00Z',
              thumbnailUrl: 't',
              url: 'u',
              downloadUrl: 'd',
            },
          ],
        },
        {
          id: 'theirs',
          yours: false,
          visibleToCoParent: true,
          downloadsAllowed: false,
          createdAt: '2026-10-12T18:00:00Z',
          photos: [
            {
              id: 'p2',
              position: 1,
              width: 10,
              height: 10,
              expiresAt: '2026-11-09T18:00:00Z',
              thumbnailUrl: 't',
              url: 'u',
              downloadUrl: null,
            },
            {
              id: 'p3',
              position: 2,
              width: 10,
              height: 10,
              expiresAt: '2026-11-09T18:00:00Z',
              thumbnailUrl: 't',
              url: 'u',
              downloadUrl: null,
            },
          ],
        },
      ],
      photosDeletedOn: null,
      downloadAll: {
        photoCount: 1,
        bytes: 3_100_000,
        omitted: 2,
        url: `${F}/memories/events/soccer/download`,
      },
      ...overrides,
    });

    async function renderMemory() {
      const fixture = TestBed.createComponent(MemoryPage);
      fixture.componentRef.setInput('eventId', 'soccer');
      fixture.detectChanges();
      await settle(fixture);
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('shows the event’s photos with what can be downloaded, and links back to the event', async () => {
      const { fixture, el } = await renderMemory();
      http.expectOne(`${F}/memories/events/soccer`).flush(photos());
      http.expectOne(F).flush(FAMILY);
      await settle(fixture);
      // The photos section loads its own copy, so it stays current after changes.
      http.expectOne(`${F}/memories/events/soccer`).flush(photos());
      // A parent can also export what they may download to their own Google Photos (#404).
      http.expectOne(`${F}/memories/events/soccer/google-photos`).flush({
        available: true,
        connection: 'Connected',
        albumTitle: 'Soccer final · Oct 12, 2026',
        exportable: 1,
        exported: 0,
        waiting: 0,
        omitted: 2,
        photos: [],
      });
      await settle(fixture);

      expect(text(el.querySelector('h1'))).toBe('Soccer final');
      expect(text(el)).toContain('Monday, October 12 · 1 photo from you · 2 shared by Sam');
      // #717: the album header shows the cover and, in the final week, a coral time-left panel.
      expect(el.querySelector('.memory-head app-memory-cover img')!.getAttribute('src')).toBe('t');
      expect(el.querySelector('.time-left-panel')!.getAttribute('data-soon')).toBe('true');
      expect(text(el.querySelector('.time-left-panel__when'))).toBe('Deleted in 3 days (Nov 9)');
      expect(el.querySelector('.time-left-panel app-time-left')).not.toBeNull();
      expect(text(el)).toContain(
        'Sam hasn’t allowed downloads of their photos, so you can view them here but not download them.',
      );
      expect(text(el)).toContain(
        'These photos are deleted in 3 days, on Nov 9. Download or export any you want to keep.',
      );
      expect(text(el.querySelector('#export-open'))).toBe('Export to Google Photos');
      expect(text(el.querySelector('.download-all a'))).toBe(
        'Download all (1 photo, about 3.1 MB)',
      );
      expect(text(el.querySelector('#photos-download-all-note'))).toContain(
        '2 photos from Sam aren’t included',
      );
      expect(el.querySelector('h2')!.textContent).toBe('Photos');
      expect(el.querySelector('a.memory-link')).toBeNull();
      expect(el.querySelector('a[href^="/calendar"]')!.getAttribute('href')).toBe(
        '/calendar?date=2026-10-12&event=soccer',
      );
      expect(await axeViolations(el)).toEqual([]);
    });

    it('says a memory isn’t here without revealing why', async () => {
      const { fixture, el } = await renderMemory();
      http
        .expectOne(`${F}/memories/events/soccer`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      http.expectOne(F).flush(FAMILY);
      await settle(fixture);

      expect(text(el.querySelector('h1'))).toBe('Memory not found');
      expect(text(el)).toContain(
        'Its photos may have been deleted, or they aren’t shared with you.',
      );
    });
  });
});
