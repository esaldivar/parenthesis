import { TestBed } from '@angular/core/testing';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { KidsGalleryItem } from '../../from-your-kids-contract';
import { KidsPhotos, KidsPhotosView, kidsCopy, newestFirst, sharedParts } from './kids-photos.component';

// Synthetic photos only (#710).
const photo = (id: string, createdAt: string, overrides: Partial<KidsGalleryItem> = {}): KidsGalleryItem => ({
  id, childId: 'kid-1', kind: 'Photo', createdAt, visibleToViewer: true, imageUrl: `/img/${id}.webp`, thumbnailUrl: `/thumb/${id}.webp`,
  altText: `Sample ${id}`, expiresAt: null, bookmarked: false, heartedByViewer: false, viewerComment: null, downloadUrl: null,
  ...overrides,
});

const photos = [
  photo('kite', '2026-11-18T20:15:00Z'),
  photo('beach', '2026-11-17T22:42:00Z', { heartedByViewer: true }),
  photo('chalk', '2026-11-16T20:15:00Z'),
  photo('older', '2026-11-15T22:42:00Z', { viewerComment: 'So proud of you' }),
];

describe('KidsPhotos (#710)', () => {
  function render(view: KidsPhotosView, items: readonly KidsGalleryItem[] = photos, photoId: string | null = null, kind: KidsGalleryItem['kind'] = 'Photo') {
    const fixture = TestBed.createComponent(KidsPhotos);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('view', view);
    fixture.componentRef.setInput('photos', items);
    fixture.componentRef.setInput('photoId', photoId);
    fixture.componentRef.setInput('childName', 'Kai');
    fixture.componentRef.setInput('timeZone', 'America/Chicago');
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('orders photos newest first and formats the family-local date and time', () => {
    expect(newestFirst([photos[2], photos[0], photos[1]]).map(p => p.id)).toEqual(['kite', 'beach', 'chalk']);
    expect(sharedParts('2026-11-18T20:15:00Z', 'en', 'America/Chicago')).toEqual({ date: 'Nov 18, 2026', time: '2:15 PM' });
    expect(sharedParts('2026-11-18T20:15:00Z', 'es-419', 'America/Chicago').date).toMatch(/18 nov.* 2026/);
  });

  describe('corkboard', () => {
    it('decorates an empty board with no on-board message or photos', () => {
      const { host } = render('board', []);
      expect([...host.querySelectorAll<HTMLImageElement>('.deco')].map(img => img.getAttribute('src'))).toEqual([
        '/art/from-your-kids/photos/pins-note.svg', '/art/from-your-kids/photos/pins-note-mobile.svg',
        '/art/from-your-kids/photos/corner-accents.svg', '/art/from-your-kids/photos/corner-accents-mobile.svg',
      ]);
      expect(host.querySelector('.visually-hidden')?.textContent).toContain('No photos shared with you yet');
      expect(host.querySelector('.pinned-photo, .post-it, .corner + .pinned')).toBeNull();
    });

    it('pins the three newest photos with thumbtacks and offers View all when there are more', () => {
      const { fixture, host } = render('board');
      const pinned = [...host.querySelectorAll<HTMLButtonElement>('.pinned-photo')];
      expect(pinned.map(button => button.querySelector<HTMLImageElement>('.snapshot')!.getAttribute('src'))).toEqual([
        '/thumb/kite.webp', '/thumb/beach.webp', '/thumb/chalk.webp',
      ]);
      expect(host.querySelectorAll('.pinned-photo .tack')).toHaveLength(3);
      expect(pinned[0].getAttribute('aria-label')).toBe('Open photo: Sample kite, shared Nov 18, 2026 · 2:15 PM');
      // Populated: only the left pinned note stays (desktop); the corner accents go.
      expect(host.querySelector('.corner')).toBeNull();
      expect(host.querySelector('.pins-note.wide')).not.toBeNull();

      const opened: string[] = [];
      let viewAll = 0;
      fixture.componentInstance.openPhoto.subscribe(id => opened.push(id));
      fixture.componentInstance.viewAll.subscribe(() => viewAll++);
      pinned[1].click();
      host.querySelector<HTMLButtonElement>('.post-it')!.click();
      expect(opened).toEqual(['beach']);
      expect(viewAll).toBe(1);
    });

    it('hides View all when the board already shows every photo', () => {
      const { host } = render('board', photos.slice(0, 3));
      expect(host.querySelector('.post-it')).toBeNull();
    });
  });

  describe('gallery', () => {
    it('lists every photo newest first with its time and a heart for photos already liked', () => {
      const { host } = render('gallery', [...photos].reverse());
      const tiles = [...host.querySelectorAll<HTMLButtonElement>('.tile')];
      expect(tiles.map(tile => tile.querySelector('.when')?.textContent)).toEqual([
        'Nov 18, 2026 · 2:15 PM', 'Nov 17, 2026 · 4:42 PM', 'Nov 16, 2026 · 2:15 PM', 'Nov 15, 2026 · 4:42 PM',
      ]);
      expect(tiles.map(tile => !!tile.querySelector('.badge'))).toEqual([false, true, false, false]);
      expect(tiles[1].getAttribute('aria-label')).toContain('You hearted this photo');
      expect(host.querySelector('h2')?.textContent).toContain('Latest photos');
      expect(host.textContent).toContain('Newest first');
    });

    it('says when nothing has been shared', () => {
      const { host } = render('gallery', []);
      expect(host.querySelector('.empty')?.textContent).toContain('No photos shared with you yet');
    });
  });

  describe('photo detail', () => {
    it('shows the photo, when it was shared, the heart overlay and the parent’s single comment', () => {
      const { fixture, host } = render('detail', photos, 'older');
      expect(host.querySelector<HTMLImageElement>('.full')!.alt).toBe('Sample older');
      expect([...host.querySelectorAll('.shared span')].map(span => span.textContent?.trim())).toEqual(['Shared Nov 15, 2026', 'at 4:42 PM']);
      expect(host.querySelector<HTMLTextAreaElement>('#photo-comment')!.value).toBe('So proud of you');
      expect(host.querySelector<HTMLTextAreaElement>('#photo-comment')!.placeholder).toBe('Write a comment for Kai…');
      expect(host.querySelector('label[for="photo-comment"]')?.textContent).toContain('Your comment');

      const hearts: { id: string; value: boolean }[] = [];
      const comments: { id: string; text: string }[] = [];
      fixture.componentInstance.heart.subscribe(event => hearts.push(event));
      fixture.componentInstance.comment.subscribe(event => comments.push(event));
      const heart = host.querySelector<HTMLButtonElement>('.heart')!;
      expect(heart.getAttribute('aria-pressed')).toBe('false');
      expect(heart.querySelector('img')!.getAttribute('src')).toContain('heart-outline');
      heart.click();
      const field = host.querySelector<HTMLTextAreaElement>('#photo-comment')!;
      field.value = '  Best day  ';
      field.dispatchEvent(new Event('input'));
      host.querySelector<HTMLButtonElement>('.save')!.click();
      expect(hearts).toEqual([{ id: 'older', value: true }]);
      expect(comments).toEqual([{ id: 'older', text: 'Best day' }]);
    });

    it('shows a liked photo’s filled heart and ignores repeat presses while saving', () => {
      const { fixture, host } = render('detail', photos, 'beach');
      expect(host.querySelector('.heart img')!.getAttribute('src')).toContain('heart-filled');
      fixture.componentRef.setInput('heartPending', true);
      fixture.componentRef.setInput('commentState', 'saving');
      fixture.detectChanges();
      const emitted: unknown[] = [];
      fixture.componentInstance.heart.subscribe(event => emitted.push(event));
      fixture.componentInstance.comment.subscribe(event => emitted.push(event));
      host.querySelector<HTMLButtonElement>('.heart')!.click();
      host.querySelector<HTMLButtonElement>('.save')!.click();
      expect(emitted).toEqual([]);
      expect(host.querySelector('.heart')!.getAttribute('aria-disabled')).toBe('true');
      expect(host.querySelector('.save')!.textContent).toContain('Saving…');
    });

    it('reports a failed save and a photo that is no longer available', () => {
      const { fixture, host } = render('detail', photos, 'kite');
      fixture.componentRef.setInput('commentState', 'failed');
      fixture.componentRef.setInput('heartFailed', true);
      fixture.detectChanges();
      expect([...host.querySelectorAll('[role="alert"]')].map(alert => alert.textContent?.trim())).toEqual([
        'We couldn’t save your comment. Try again.', 'We couldn’t update the heart. Try again.',
      ]);
      fixture.componentRef.setInput('photoId', 'gone');
      fixture.detectChanges();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('This photo isn’t available anymore.');
      expect(host.querySelector('.back-photos')?.textContent).toContain('Back to photos');
    });

    it('is fully translated in Spanish', () => {
      TestBed.inject(LocaleService).setLocale('es-419');
      const { fixture, host } = render('detail', photos, 'kite');
      fixture.componentRef.setInput('preview', true);
      fixture.detectChanges();
      expect(host.querySelector('.back-photos')?.textContent).toContain('Volver a las fotos');
      expect(host.querySelector('.shared span')?.textContent).toContain('Compartida el');
      expect(host.querySelector('.save')?.textContent).toContain('Guardar comentario');
      expect(host.querySelector('.note')?.textContent).toContain('no se envían a Kai');
      TestBed.inject(LocaleService).setLocale('en');
    });
  });
  describe('Artwork (#714)', () => {
    const art = photos.map(item => ({ ...item, kind: 'Artwork' as const }));

    it('names Photos and Artwork copy separately', () => {
      expect(kidsCopy('Photo', 'viewAll')).toBe('kids.photos.viewAll');
      expect(kidsCopy('Artwork', 'viewAll')).toBe('kids.artwork.viewAll');
    });

    it('shows the empty fridge with its message and no drawings', () => {
      const { host } = render('board', [], null, 'Artwork');
      expect(host.querySelector('.fridge')).not.toBeNull();
      expect(host.querySelector('.board, .drawing, .fridge-note')).toBeNull();
      expect(host.querySelector('.fridge-empty')?.textContent).toContain('No artwork shared with you yet.');
      expect(host.querySelector('.fridge-area')?.getAttribute('aria-label')).toBe('Kai’s artwork fridge');
    });

    it('holds the three newest drawings with magnets and offers View all for the rest', () => {
      const { fixture, host } = render('board', art, null, 'Artwork');
      const drawings = [...host.querySelectorAll<HTMLButtonElement>('.fridge .drawing')];
      expect(drawings.map(button => button.querySelector('img')!.getAttribute('src'))).toEqual(['/thumb/kite.webp', '/thumb/beach.webp', '/thumb/chalk.webp']);
      expect(host.querySelectorAll('.drawing .magnet')).toHaveLength(3);
      expect(drawings[0].getAttribute('aria-label')).toBe('Open artwork: Sample kite, shared Nov 18, 2026 · 2:15 PM');
      const opened: string[] = [];
      let viewAll = 0;
      fixture.componentInstance.openPhoto.subscribe(id => opened.push(id));
      fixture.componentInstance.viewAll.subscribe(() => viewAll++);
      drawings[2].click();
      host.querySelector<HTMLButtonElement>('.fridge-note')!.click();
      expect(opened).toEqual(['chalk']);
      expect(viewAll).toBe(1);
      expect(host.querySelector('.fridge-note')?.textContent).toContain('View all artwork');
    });

    it('hides View all when every drawing is on the fridge', () => {
      const { host } = render('board', art.slice(0, 2), null, 'Artwork');
      expect(host.querySelectorAll('.fridge .drawing')).toHaveLength(2);
      expect(host.querySelector('.fridge-note')).toBeNull();
    });

    it('uses Artwork copy and mats in the gallery and detail', () => {
      const gallery = render('gallery', art, null, 'Artwork').host;
      expect(gallery.querySelector('h2')?.textContent).toContain('Latest artwork');
      expect(gallery.querySelectorAll('.frame.mat')).toHaveLength(4);
      expect(gallery.querySelectorAll<HTMLButtonElement>('.tile')[1].getAttribute('aria-label')).toContain('You hearted this artwork');
      const detail = render('detail', art, 'kite', 'Artwork').host;
      expect(detail.querySelector('.photo-frame.mat')).not.toBeNull();
      expect(detail.querySelector('.back-photos')?.textContent).toContain('Back to artwork');
      expect(detail.querySelector('.heart')?.getAttribute('aria-label')).toBe('Heart this artwork');
      expect(render('detail', art, 'gone', 'Artwork').host.querySelector('[role="alert"]')?.textContent).toContain('This artwork isn’t available anymore.');
    });

    it('is translated in Spanish', () => {
      TestBed.inject(LocaleService).setLocale('es-419');
      const { host } = render('board', art, null, 'Artwork');
      expect(host.querySelector('.fridge-note')?.textContent).toContain('Ver todos los dibujos');
      expect(host.querySelector('.fridge-area')?.getAttribute('aria-label')).toBe('Refrigerador de dibujos de Kai');
      TestBed.inject(LocaleService).setLocale('en');
    });
  });
});
