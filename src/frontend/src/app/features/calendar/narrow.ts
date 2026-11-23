import { DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/** Below this width a calendar view uses its phone layout (#729): the day agenda instead of the time grid. */
export const NARROW_BELOW = 600;

/**
 * Tracks whether a calendar view's own box is narrow, so it can choose its phone layout from the space it has rather
 * than the window (the views sit beside a sidebar on desktop). Extend it from a component.
 */
export abstract class NarrowHost {
  protected readonly narrow = signal(false);

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = host.nativeElement as HTMLElement;
      const measure = (width: number) => this.narrow.set(width > 0 && width < NARROW_BELOW);
      measure(element.getBoundingClientRect().width);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
