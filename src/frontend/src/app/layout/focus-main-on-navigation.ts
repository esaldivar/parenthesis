import { DestroyRef, ElementRef, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip } from 'rxjs';

/**
 * After an in-app navigation, moves focus to the main region so keyboard and screen-reader users land on the new
 * page's content instead of staying in the navigation. Not on first load: the browser handles that.
 */
export function focusMainOnNavigation(main: () => ElementRef<HTMLElement> | undefined): void {
  const subscription = inject(Router)
    .events.pipe(
      filter((event) => event instanceof NavigationEnd),
      skip(1),
    )
    .subscribe(() => queueMicrotask(() => main()?.nativeElement.focus({ preventScroll: false })));
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
}
