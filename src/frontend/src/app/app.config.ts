import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { clearCalendarCacheOnWrite } from './core/cache/calendar-cache';
import { PageTitleStrategy } from './core/page-title.strategy';
import { NavigationRecovery } from './core/navigation-recovery';
import { installBottomNavClearance } from './shared/overlay/bottom-nav-clearance';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The API issues a readable XSRF-TOKEN cookie; Angular echoes it as X-XSRF-TOKEN on same-origin unsafe requests.
    // Any change sent to the server also clears the calendar's in-memory cache (#415).
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([clearCalendarCacheOnWrite]),
    ),
    provideRouter(routes, withComponentInputBinding(), withNavigationErrorHandler((error) => inject(NavigationRecovery).handle(error))),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // Know who is signed in before the first route's guards run.
    provideAppInitializer(() => inject(AuthStore).initialize()),
    // Nonmodal popups open above the phone layout's bottom navigation, never over it (#327).
    provideAppInitializer(() => installBottomNavClearance()),
  ],
};
