import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventPhoto, EventPhotos, PhotoBatch } from '../../core/api/api';
import { Toasts } from '../../shared/toast/toasts';
import { axeViolations } from '../../../testing/axe';
import { EventPhotosSection } from './event-photos';
import { PHOTOS_NOW } from './photo-text';

// Synthetic family only: you are Alex, Sam is the co-parent.
const F = '/api/families/family-1';
const EVENT = `${F}/memories/events/soccer`;
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
  visibleToCoParent: false,
  downloadsAllowed: true,
  createdAt: '2026-10-12T17:00:00Z',
  photos: [photo(`${id}-1`), photo(`${id}-2`, { position: 2 })],
  ...overrides,
});

const view = (overrides: Partial<EventPhotos> = {}): EventPhotos => ({
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
  batches: [],
  photosDeletedOn: null,
  ...overrides,
});

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

function button(within: Element, label: string): HTMLButtonElement {
  const match = [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
  if (!match) {
    throw new Error(`No button "${label}" in: ${text(within)}`);
  }
  return match;
}

function jpeg(name: string, size = 3_100_000): File {
  const f = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('event photos (#403)', () => {
  let http: HttpTestingController;
  let toasts: string[];

  async function settle(fixture: ComponentFixture<unknown>) {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render(answer: EventPhotos | null, inputs: Record<string, unknown> = {}) {
    toasts = [];
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: PHOTOS_NOW, useValue: () => NOW }],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Toasts).show = (message: string) => void toasts.push(message);
    const fixture = TestBed.createComponent(EventPhotosSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('eventId', 'soccer');
    fixture.componentRef.setInput('timeZone', 'America/Chicago');
    fixture.componentRef.setInput('coParent', 'Sam');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    if (answer) {
      http.expectOne(EVENT).flush(answer);
    }
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function choose(fixture: ComponentFixture<unknown>, el: HTMLElement, files: File[]) {
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
  }

  afterEach(() => http.verify());

  it('never offers photos on a pending event, and asks the server nothing', async () => {
    const { el } = await render(null, { eventStatus: 'pending' });

    expect(text(el)).toContain('Photos can be added once this event is confirmed.');
    expect(el.querySelector('#photos-add')).toBeNull();
    http.expectNone(EVENT);
  });

  it('shows your private batch and the co-parent’s shared batch, labelled for screen readers', async () => {
    const { el } = await render(
      view({
        batches: [batch('mine'), batch('theirs', { yours: false, visibleToCoParent: true, downloadsAllowed: false, photos: [photo('t-1')] })],
      }),
    );

    expect(text(el)).toContain('You can add 8 more (2 of your 10 used). Photos are deleted 28 days after upload.');
    const batches = [...el.querySelectorAll('.batch')];
    expect(batches.map((b) => b.getAttribute('aria-label'))).toEqual(['Your photos · Oct 12', 'Sam’s photos · Oct 12']);
    expect(text(batches[0].querySelector('.chip'))).toBe('Only you');
    expect(text(batches[1].querySelector('.chip'))).toBe('Shared with you');
    expect(text(batches[1])).toContain('Sam hasn’t allowed downloads');
    // Only your own batch has the sharing switch, named with its date.
    expect(batches[0].querySelector('[role=switch]')!.getAttribute('aria-label')).toBe('Visible to Co-Parent, your Oct 12 photos');
    expect(batches[1].querySelector('[role=switch]')).toBeNull();
    expect([...el.querySelectorAll('.tile')].map((t) => t.getAttribute('aria-label'))).toEqual([
      'Photo 1 of 3, yours',
      'Photo 2 of 3, yours',
      'Photo 3 of 3, shared by Sam',
    ]);
    expect(el.querySelector('a.memory-link')!.getAttribute('href')).toBe('/memories/soccer');
    expect(await axeViolations(el)).toEqual([]);
  });

  it('says plainly why photos can’t be added', async () => {
    const blocked = (block: 'not-caregiver' | 'not-started') => view({ uploads: { ...view().uploads, blocked: block, used: 0, remaining: 0 } });
    const { el } = await render(blocked('not-caregiver'), { caregiver: 'Sam' });

    expect(text(el)).toContain('Sam has the kids during this parenting time, so only Sam can add photos.');
    expect(el.querySelector('#photos-add')).toBeNull();
  });

  it('says when all your spots are used, and when uploads are switched off', async () => {
    const { el } = await render(view({ uploads: { ...view().uploads, used: 10, remaining: 0 }, batches: [batch('mine')] }));

    expect(text(el)).toContain('You’ve added all 10 of your photos for this event. Delete one to add another.');
    expect(el.querySelector('#photos-add')).toBeNull();
  });

  it('checks files first, states privacy and retention, then reports each upload’s own result', async () => {
    const { fixture, el } = await render(view({ uploads: { ...view().uploads, used: 0, remaining: 10 } }));
    expect(text(el)).toContain('No photos yet. Add up to 10 of your own, 5 at a time. Only you see them unless you share them.');

    const raw = new File(['x'], 'IMG_2043.dng', { type: 'image/x-adobe-dng' });
    await choose(fixture, el, [jpeg('IMG_2041.jpg'), jpeg('IMG_2042.jpg', 2_800_000), raw]);

    const sheet = el.querySelector('.sheet')!;
    expect(text(sheet.querySelector('#photos-sheet-heading'))).toBe('Add photos to Soccer final');
    expect(text(sheet)).toContain('Not added IMG_2043.dng');
    expect(text(sheet)).toContain('RAW photos (DNG) aren’t supported. Export it as a JPEG and add that instead.');
    expect(text(sheet)).toContain(
      '2 photos will be added. Only you will see them until you turn on Visible to Co-Parent. They’re deleted on Nov 9, 28 days after upload.',
    );
    expect(text(sheet)).toContain('Up to 5 at a time · You can add 10 more to this event · 212 MB of your 250 MB left');

    button(sheet, 'Add 2 photos').click();
    await settle(fixture);
    // One batch: the first photo starts it, the next joins it.
    const first = http.expectOne((r) => r.method === 'POST' && r.url === `${EVENT}/photos`);
    expect(first.request.params.has('batchId')).toBe(false);
    expect(first.request.headers.get('Content-Type')).toBe('image/jpeg');
    first.flush({ batchId: 'b-new', photo: photo('n-1') }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    const second = http.expectOne((r) => r.method === 'POST' && r.url === `${EVENT}/photos`);
    expect(second.request.params.get('batchId')).toBe('b-new');
    second.error(new ProgressEvent('error'), { status: 0 });
    await settle(fixture);
    http.expectOne(EVENT).flush(view({ uploads: { ...view().uploads, used: 1, remaining: 9 }, batches: [batch('b-new', { photos: [photo('n-1')] })] }));
    await settle(fixture);

    // A failure is never shown as added, and can be tried again.
    const rows = [...el.querySelectorAll('.files li')].map(text);
    expect(rows[0]).toContain('IMG_2041.jpg');
    expect(rows[0]).toContain('Added');
    expect(rows[1]).toContain('Not added IMG_2042.jpg');
    expect(rows[1]).toContain('Couldn’t upload. Check your connection and try again.');
    expect(el.querySelector('[aria-live=polite]')!.textContent).toContain('1 of 2 photos added. 1 couldn’t be added.');

    button(el, 'Try again IMG_2042.jpg').click();
    await settle(fixture);
    http
      .expectOne((r) => r.method === 'POST' && r.params.get('batchId') === 'b-new')
      .flush({ batchId: 'b-new', photo: photo('n-2') }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    http.expectOne(EVENT).flush(view({ batches: [batch('b-new')] }));
    await settle(fixture);
    expect(el.querySelector('[aria-live=polite]')!.textContent).toContain('All 2 photos were added.');

    button(el, 'Done').click();
    await settle(fixture);
    expect(toasts).toEqual(['2 photos added. Only you can see them until you share.']);
    expect(el.querySelector('.sheet')).toBeNull();
  });

  it('starts a new batch when this upload’s batch closed, without losing the photo', async () => {
    const { fixture, el } = await render(view());
    await choose(fixture, el, [jpeg('a.jpg'), jpeg('b.jpg')]);
    button(el, 'Add 2 photos').click();
    await settle(fixture);

    http.expectOne((r) => r.method === 'POST').flush({ batchId: 'b-1', photo: photo('a') }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    // Thirty minutes passed: that batch closed, so the photo goes into a new one.
    const closed = http.expectOne((r) => r.method === 'POST');
    expect(closed.request.params.get('batchId')).toBe('b-1');
    closed.flush({ title: 'Start a new upload to add more photos.', reason: 'batch-closed' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    const again = http.expectOne((r) => r.method === 'POST');
    expect(again.request.params.has('batchId')).toBe(false);
    again.flush({ batchId: 'b-2', photo: photo('b') }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    http.expectOne(EVENT).flush(view());
    await settle(fixture);
    expect(el.querySelector('[aria-live=polite]')!.textContent).toContain('All 2 photos were added.');
  });

  it('asks you to choose fewer when the event has less room', async () => {
    const { fixture, el } = await render(view({ uploads: { ...view().uploads, used: 9, remaining: 1 } }));
    await choose(fixture, el, [jpeg('a.jpg'), jpeg('b.jpg')]);

    expect(text(el.querySelector('[role=alert]'))).toBe('This event has room for 1 more of your photos. Choose 1 photo.');
    expect(() => button(el, 'Add 2 photos')).toThrow();
  });

  it('asks before turning sharing off, and explains what can’t be recalled', async () => {
    const { fixture, el } = await render(view({ batches: [batch('mine', { visibleToCoParent: true })] }));
    expect(text(el.querySelector('.chip'))).toBe('Shared with Sam');

    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await settle(fixture);
    http.expectNone((r) => r.method === 'PATCH');
    const confirm = el.querySelector('.confirm')!;
    expect(text(confirm)).toContain(
      'Stop sharing these 2 photos? Sam won’t see them in Parenthesis any more. Copies already downloaded can’t be recalled.',
    );

    button(confirm, 'Stop sharing').click();
    await settle(fixture);
    const patch = http.expectOne(`${F}/memories/batches/mine`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ visibleToCoParent: false });
    patch.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(EVENT).flush(view({ batches: [batch('mine')] }));
    await settle(fixture);
    expect(toasts).toEqual(['Sam can’t see these photos any more.']);
    expect(text(el.querySelector('.chip'))).toBe('Only you');
  });

  it('turns sharing on at once', async () => {
    const { fixture, el } = await render(view({ batches: [batch('mine')] }));

    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await settle(fixture);
    const patch = http.expectOne(`${F}/memories/batches/mine`);
    expect(patch.request.body).toEqual({ visibleToCoParent: true });
    patch.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(EVENT).flush(view({ batches: [batch('mine', { visibleToCoParent: true })] }));
    await settle(fixture);
    expect(toasts).toEqual(['Sam can now see these photos.']);
  });

  it('opens a photo to view, download or delete it', async () => {
    const { fixture, el } = await render(view({ batches: [batch('mine')] }));

    el.querySelector<HTMLButtonElement>('#photo-mine-1')!.click();
    await settle(fixture);
    const viewer = el.querySelector('.viewer')!;
    expect(text(viewer.querySelector('#photo-viewer-heading'))).toBe('Photo 1 of 2, yours');
    expect(viewer.querySelector('img')!.getAttribute('alt')).toBe('Photo 1 of 2, yours from Soccer final');
    expect(viewer.querySelector('a[download]')!.getAttribute('href')).toBe(`${F}/memories/photos/mine-1/download`);

    button(viewer, 'Delete photo…').click();
    await settle(fixture);
    expect(text(el.querySelector('.viewer'))).toContain('Deleting removes it for both of you now and frees its spot and storage.');
    button(el.querySelector('.viewer')!, 'Delete photo').click();
    await settle(fixture);
    const remove = http.expectOne(`${F}/memories/photos/mine-1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(EVENT).flush(view({ batches: [batch('mine', { photos: [photo('mine-2')] })] }));
    await settle(fixture);
    expect(el.querySelector('.viewer')).toBeNull();
    expect(toasts).toEqual(['Photo deleted. Its spot and storage are free again.']);
  });

  it('never offers download or delete for the co-parent’s photo you may only view', async () => {
    const { fixture, el } = await render(
      view({ batches: [batch('theirs', { yours: false, visibleToCoParent: true, downloadsAllowed: false, photos: [photo('t-1', { downloadUrl: null })] })] }),
    );

    el.querySelector<HTMLButtonElement>('#photo-t-1')!.click();
    await settle(fixture);
    const viewer = el.querySelector('.viewer')!;
    expect(viewer.querySelector('a[download]')).toBeNull();
    expect(viewer.querySelector('#photo-delete')).toBeNull();
  });

  it('warns in the final week, and says when the photos are gone', async () => {
    const soon = view({ batches: [batch('mine', { photos: [photo('p', { expiresAt: '2026-10-15T17:00:00Z' })] })] });
    const { el } = await render(soon);
    expect(text(el.querySelector('.warning'))).toBe('This photo is deleted in 3 days, on Oct 15. Download any you want to keep.');
    expect(text(el.querySelector('.batch .hint'))).toBe('Deleted in 3 days');
  });

  it('says when an event’s photos were deleted', async () => {
    const { el } = await render(view({ photosDeletedOn: '2026-11-09T17:00:00Z' }));

    expect(text(el)).toContain('The photos from this event were deleted on Nov 9, 28 days after they were added.');
    expect(el.querySelector('a.memory-link')).toBeNull();
  });

  it('offers to try again when photos can’t load', async () => {
    const { fixture, el } = await render(null);
    http.expectOne(EVENT).error(new ProgressEvent('error'), { status: 0 });
    await settle(fixture);

    expect(text(el.querySelector('[role=alert]'))).toContain('Photos couldn’t load.');
    button(el, 'Try again').click();
    await settle(fixture);
    http.expectOne(EVENT).flush(view());
    await settle(fixture);
    expect(el.querySelector('[role=alert]')).toBeNull();
  });
});
