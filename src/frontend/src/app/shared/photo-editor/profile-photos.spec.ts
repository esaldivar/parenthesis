import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhotoSet } from '../../core/api/api';
import { PhotoSubject, ProfilePhotos } from '../../core/profile-photos/profile-photos';
import { axeViolations } from '../../../testing/axe';
import { Avatar } from '../avatar/avatar';
import { PhotoEditor } from './photo-editor';

// Synthetic family only: Dad (m-dad), Mom (m-mom), Kai and Mia.
const DADS_VIEW: PhotoSet = {
  youKind: 'parent',
  youId: 'm-dad',
  photos: [
    { kind: 'parent', id: 'm-dad', url: '/api/families/f1/photos/dad-own' },
    { kind: 'parent', id: 'm-mom', url: '/api/families/f1/photos/mom-own' },
    { kind: 'child', id: 'kai', url: '/api/families/f1/photos/dads-kai' },
  ],
};

async function loadPhotos(http: HttpTestingController, set: PhotoSet = DADS_VIEW) {
  const load = TestBed.inject(ProfilePhotos).load('f1');
  http.expectOne('/api/families/f1/photos').flush(set);
  await load;
}

const image = (host: Element) => host.querySelector('img');

describe('Profile photos (#388)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('the store', () => {
    it('resolves only what this viewer was given, and never another person’s choice', async () => {
      await loadPhotos(http);
      const photos = TestBed.inject(ProfilePhotos);

      expect(photos.own()).toBe('/api/families/f1/photos/dad-own');
      expect(photos.url('parent', 'm-mom')).toBe('/api/families/f1/photos/mom-own');
      expect(photos.url('child', 'kai')).toBe('/api/families/f1/photos/dads-kai');
      // Mia has no photo from Dad: the initial shows, whatever Mom or Mia chose.
      expect(photos.url('child', 'mia')).toBeNull();
      // Ids are only looked up with their own kind.
      expect(photos.url('child', 'm-dad')).toBeNull();
    });

    it('clears everything for the next profile', async () => {
      await loadPhotos(http);
      const photos = TestBed.inject(ProfilePhotos);

      await photos.load(null);

      expect(photos.own()).toBeNull();
      expect(photos.url('child', 'kai')).toBeNull();
    });

    it('shows initials when photos can’t be loaded', async () => {
      const photos = TestBed.inject(ProfilePhotos);
      const load = photos.load('f1');
      http.expectOne('/api/families/f1/photos').flush(null, { status: 500, statusText: 'Error' });
      await load;

      expect(photos.own()).toBeNull();
    });
  });

  describe('the avatar', () => {
    @Component({
      imports: [Avatar],
      template: `
        <app-avatar id="mine" name="Dad" kind="parent" [personId]="'m-dad'" />
        <app-avatar id="kai" name="Kai" [personId]="'kai'" photoOn="desktop" />
        <app-avatar id="mia" name="Mia" [personId]="'mia'" />
        <app-avatar id="tile" name="Mia" [src]="tile()" />
      `,
    })
    class Host {
      readonly tile = signal<string | null>('/api/device/photos/mias-own');
    }

    let fixture: ComponentFixture<Host>;
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;

    beforeEach(async () => {
      await loadPhotos(http);
      fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
    });

    it('shows the viewer’s photo with the initial underneath as the fallback, decoratively', () => {
      expect(image(el('mine'))?.getAttribute('src')).toBe('/api/families/f1/photos/dad-own');
      expect(image(el('mine'))?.getAttribute('alt')).toBe('');
      expect(el('mine').textContent!.trim()).toBe('D');
      expect(el('mine').getAttribute('aria-hidden')).toBe('true');
    });

    it('marks calendar circles so phones and tablets keep the initial', () => {
      expect(el('kai').getAttribute('data-photo')).toBe('desktop');
      expect(el('mine').getAttribute('data-photo')).toBe('any');
    });

    it('keeps the initial when this viewer has no photo for someone', () => {
      expect(image(el('mia'))).toBeNull();
      expect(el('mia').getAttribute('data-photo')).toBeNull();
      expect(el('mia').textContent!.trim()).toBe('M');
    });

    it('uses an explicit photo, such as the picker’s, and falls back to the initial if it fails to load', () => {
      expect(image(el('tile'))?.getAttribute('src')).toBe('/api/device/photos/mias-own');

      image(el('tile'))!.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(image(el('tile'))).toBeNull();
      expect(el('tile').textContent!.trim()).toBe('M');

      fixture.componentInstance.tile.set('/api/device/photos/mias-new');
      fixture.detectChanges();
      expect(image(el('tile'))?.getAttribute('src')).toBe('/api/device/photos/mias-new');
    });
  });

  describe('the editor', () => {
    @Component({
      imports: [PhotoEditor],
      template: `
        <main>
          <app-photo-editor
            familyId="f1"
            [subject]="subject"
            [childId]="childId"
            [name]="name"
            [label]="name"
            hint="Only you see this photo."
            [forWhom]="'for ' + name"
          />
        </main>
      `,
    })
    class Host {
      subject: PhotoSubject = { kind: 'child', id: 'kai' };
      childId: string | null = 'kai';
      name = 'Kai';
    }

    let fixture: ComponentFixture<Host>;
    let created: string[];
    let revoked: string[];
    const root = () => fixture.nativeElement as HTMLElement;
    const text = () => root().textContent!.replace(/\s+/g, ' ');
    const button = (label: string) => {
      const match = [...root().querySelectorAll('button')].find((b) => b.textContent!.replace(/\s+/g, ' ').trim().startsWith(label));
      if (!match) throw new Error(`No button "${label}" in: ${text()}`);
      return match;
    };
    const choose = (file: File) => {
      const input = root().querySelector<HTMLInputElement>('input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const preview = () => root().querySelector('app-avatar img')?.getAttribute('src');
    const jpeg = (size = 1024) => new File([new Uint8Array(size)], 'kai.jpg', { type: 'image/jpeg' });

    async function render(set: PhotoSet = DADS_VIEW, host: Partial<Host> = {}) {
      await loadPhotos(http, set);
      fixture = TestBed.createComponent(Host);
      Object.assign(fixture.componentInstance, host);
      fixture.detectChanges();
    }

    beforeEach(() => {
      created = [];
      revoked = [];
      let next = 0;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
        const url = `blob:preview-${++next}`;
        created.push(url);
        return url;
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
    });

    afterEach(() => vi.restoreAllMocks());

    it('previews a chosen photo without saving it, and Cancel keeps the current one', async () => {
      await render();
      expect(preview()).toBe('/api/families/f1/photos/dads-kai');

      button('Change photo').click();
      choose(jpeg());

      expect(preview()).toBe('blob:preview-1');
      expect(text()).toContain('Preview. It isn’t saved yet.');
      button('Cancel').click();
      fixture.detectChanges();
      expect(preview()).toBe('/api/families/f1/photos/dads-kai');
      expect(revoked).toEqual(['blob:preview-1']);
      http.expectNone('/api/families/f1/photos/children/kai');
    });

    it('saves this parent’s photo of the child and shows it everywhere this parent sees Kai', async () => {
      await render();
      choose(jpeg());

      button('Save photo').click();
      const request = http.expectOne('/api/families/f1/photos/children/kai');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toBeInstanceOf(File);
      expect(request.request.headers.get('Content-Type')).toBe('image/jpeg');
      request.flush({ kind: 'child', id: 'kai', url: '/api/families/f1/photos/dads-kai-2' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(TestBed.inject(ProfilePhotos).url('child', 'kai')).toBe('/api/families/f1/photos/dads-kai-2');
      expect(preview()).toBe('/api/families/f1/photos/dads-kai-2');
      expect(root().querySelector('[role=status]')!.textContent).toContain('Photo saved.');
    });

    it('keeps an unsaved photo for retry after connection failure (#413)', async () => {
      await render();
      choose(jpeg());
      button('Save photo').click();
      fixture.detectChanges();
      expect(root().querySelectorAll('[role=status]')).toHaveLength(1);
      expect(root().querySelector('[role=status]')!.textContent).toBe('Uploading photo…');
      expect(root().querySelector('app-loading-indicator svg')).not.toBeNull();
      button('Saving…').click();
      const request = http.expectOne('/api/families/f1/photos/children/kai');
      request.error(new ProgressEvent('error'), { status: 0 });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(preview()).toBe('blob:preview-1');
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root().querySelector('app-loading-indicator svg')).toBeNull();
      });
      button('Try again').click();
      http.expectOne('/api/families/f1/photos/children/kai')
        .flush({ kind: 'child', id: 'kai', url: '/api/families/f1/photos/retried' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(preview()).toBe('/api/families/f1/photos/retried');
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root().querySelectorAll('[role=status]')).toHaveLength(1);
        expect(root().querySelector('[role=status]')!.textContent).toBe('Photo saved.');
      });
    });

    it('keeps the previous photo and explains a refused upload', async () => {
      await render();
      choose(jpeg());

      button('Save photo').click();
      http
        .expectOne('/api/families/f1/photos/children/kai')
        .flush({ title: 'That picture is too big.', reason: 'too-many-pixels' }, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(root().querySelector('[role=alert]')!.textContent).toContain('That picture is too big. Choose a smaller photo.');
      expect(preview()).toBe('/api/families/f1/photos/dads-kai');
      expect(TestBed.inject(ProfilePhotos).url('child', 'kai')).toBe('/api/families/f1/photos/dads-kai');
    });

    it('refuses other file types and oversized files before uploading', async () => {
      await render();

      choose(new File(['<svg/>'], 'kai.svg', { type: 'image/svg+xml' }));
      expect(root().querySelector('[role=alert]')!.textContent).toContain('Choose a JPEG, PNG or WebP photo.');

      choose(jpeg(8 * 1024 * 1024 + 1));
      expect(root().querySelector('[role=alert]')!.textContent).toContain('smaller than 8 MB');
      expect(created).toEqual([]);
    });

    it('removes the photo so the initial shows', async () => {
      await render();

      button('Remove photo').click();
      const request = http.expectOne('/api/families/f1/photos/children/kai');
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(preview()).toBeUndefined();
      expect(text()).toContain('No photo yet, so the initial K shows.');
      expect(button('Choose a photo').textContent).toContain('for Kai');
      expect(root().querySelector('[role=status]')!.textContent).toContain('The initial K shows instead.');
    });

    it('edits a signed-in child’s own photo through “me”', async () => {
      await render({ youKind: 'child', youId: 'kai', photos: [] }, { childId: null });
      choose(jpeg());

      button('Save photo').click();
      const request = http.expectOne('/api/families/f1/photos/me');
      expect(request.request.method).toBe('PUT');
      request.flush({ kind: 'child', id: 'kai', url: '/api/families/f1/photos/kais-own' });
      await fixture.whenStable();

      expect(TestBed.inject(ProfilePhotos).own()).toBe('/api/families/f1/photos/kais-own');
    });

    it('has labelled controls and no axe violations', async () => {
      await render();

      expect(button('Change photo').textContent).toContain('for Kai');
      expect(button('Remove photo').textContent).toContain('for Kai');
      expect(root().querySelector('input[type=file]')!.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
      expect(await axeViolations(root())).toEqual([]);
    });
  });
});
