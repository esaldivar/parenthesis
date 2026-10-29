import { FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Nonmodal popups never cover the bottom navigation (#327). Date pickers, selects, autocompletes, menus and the
 * calendar search all place themselves with the CDK's connected position strategy. It treats the navigation as the
 * edge of the screen: a popup opens above it, or flips upward, and its click-catching backdrop stops at it, so one
 * tap on the navigation dismisses the popup and navigates. Modal dialogs keep their full-screen backdrop.
 */

/** The navigation's height that overlaps the screen, safe-area inset included; 0 when it isn't shown (desktop). */
export function bottomNavClearance(doc: Document = document): number {
  const nav = doc.querySelector<HTMLElement>('[data-bottom-nav]');
  const rect = nav?.getBoundingClientRect();
  if (!rect || rect.height === 0) {
    return 0;
  }
  return Math.max(0, Math.round(doc.documentElement.clientHeight - rect.top));
}

/** Nonmodal popups' click-catching backdrops: the CDK's class, and the one Material's date picker uses instead. */
const TRANSPARENT_BACKDROPS = '.cdk-overlay-transparent-backdrop, .mat-overlay-transparent-backdrop';

interface StrategyPrototype {
  _getViewportMarginBottom?: () => number;
  withLockedPosition?: (isLocked?: boolean) => unknown;
  __bottomNavClearance?: true;
}

/**
 * Adds the navigation to every connected popup's bottom viewport margin. Material sets those margins itself (8px for
 * date pickers, none for menus), so the CDK's own margin method is wrapped. It's read on every reposition, so the
 * clearance follows scrolling, resizing, rotation and enlarged text. A unit test fails if a CDK upgrade renames it.
 *
 * Material also locks a date picker to the side it first opened on. A locked picker that opened below a field stays
 * there when the screen gets shorter (rotation, browser bars, keyboard) and slides under the navigation, so popups
 * are never locked: they flip upward whenever the space below runs out (owner-approved behavior, #327).
 */
export function installBottomNavClearance(): void {
  const proto = FlexibleConnectedPositionStrategy.prototype as unknown as StrategyPrototype;
  const original = proto._getViewportMarginBottom;
  const lock = proto.withLockedPosition;
  if (typeof original !== 'function' || typeof lock !== 'function') {
    console.error('Bottom navigation clearance: the CDK position strategy changed; popups may cover the navigation.');
    return;
  }
  if (proto.__bottomNavClearance) {
    return;
  }
  proto._getViewportMarginBottom = function (this: unknown) {
    return original.call(this) + bottomNavClearance();
  };
  proto.withLockedPosition = function (this: unknown) {
    return lock.call(this, false);
  };
  proto.__bottomNavClearance = true;
}

/**
 * Marks a shell's bottom navigation. Keeps `--bottom-nav-clearance` current for the popup backdrop, and closes open
 * nonmodal popups when the navigation is used, so they never linger over the next page.
 */
@Directive({
  selector: '[appBottomNav]',
  host: { 'data-bottom-nav': '', '(click)': 'dismissPopups()' },
})
export class BottomNav {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const root = document.documentElement;
    const destroyRef = inject(DestroyRef);
    const update = () => root.style.setProperty('--bottom-nav-clearance', `${bottomNavClearance()}px`);
    afterNextRender(() => {
      update();
      const observer = new ResizeObserver(update);
      observer.observe(this.host.nativeElement);
      window.addEventListener('resize', update);
      window.visualViewport?.addEventListener('resize', update);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        window.removeEventListener('resize', update);
        window.visualViewport?.removeEventListener('resize', update);
        root.style.removeProperty('--bottom-nav-clearance');
      });
    });
  }

  /** A tap on the navigation is a tap outside any open nonmodal popup: close each one as its backdrop would. */
  protected dismissPopups(): void {
    for (const backdrop of document.querySelectorAll<HTMLElement>(TRANSPARENT_BACKDROPS)) {
      backdrop.click();
    }
  }
}
