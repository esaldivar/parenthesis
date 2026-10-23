import { provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { PageTitleStrategy } from './core/page-title.strategy';
import { NavigationRecovery } from './core/navigation-recovery';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The API issues a readable XSRF-TOKEN cookie; Angular echoes it as X-XSRF-TOKEN on same-origin unsafe requests.
    provideHttpClient(withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
    provideRouter(routes, withComponentInputBinding(), withNavigationErrorHandler((error) => inject(NavigationRecovery).handle(error))),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // Know who is signed in before the first route's guards run.
    provideAppInitializer(() => inject(AuthStore).initialize()),
  ],
};
