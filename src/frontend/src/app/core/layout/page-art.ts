import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Decorative header artwork a page asks the desktop shell to draw above it (#729). */
export type PageArtwork = 'calendar';

/**
 * The approved Calendar illustration starts at the top of the window, over the top bar and the page heading, so the
 * page can't draw it inside its own scrolling area. The page names it here; the parent shell draws it behind the
 * page, on desktop only, and it goes away with the page. It is always decorative.
 */
@Injectable({ providedIn: 'root' })
export class PageArt {
  readonly current = signal<PageArtwork | null>(null);

  /** Shows `art` while the calling component exists. Call from a constructor or another injection context. */
  show(art: PageArtwork): void {
    this.current.set(art);
    inject(DestroyRef).onDestroy(() => {
      if (this.current() === art) this.current.set(null);
    });
  }
}
