import { expect, test } from '@playwright/test';
import { soloParent } from '../../support/family';
import { activate, evidence, fitsPage } from '../../support/mobile';

const order = ['/', '/calendar', '/messages', '/shared-records', '/child-essentials', '/from-your-kids', '/memories', '/settings'];
const labels = {
  en: ['Home', 'Calendar', 'Messages', 'Shared records', 'Child Essentials', 'From Your Kids', 'Family Memories', 'Settings', 'More'],
  'es-419': ['Inicio', 'Calendario', 'Mensajes', 'Registros compartidos', 'Información esencial de tus hijos', 'De tus hijos', 'Recuerdos familiares', 'Configuración', 'Más'],
} as const;

for (const language of ['en', 'es-419'] as const) {
  test(`parent navigation follows the requested order in ${language} (#549)`, {
    tag: ['@m4', '@regression'],
  }, async ({ page }, info) => {
    const { dad } = await soloParent('Alex');
    try {
      await dad.json(dad.put('/api/me/language', { language }));
      await page.context().addCookies((await dad.http.storageState()).cookies);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const sidebar = page.locator('nav.sidenav');
      const bottom = page.locator('nav.bottomnav');
      const current = labels[language];

      if (!info.project.use.hasTouch) {
        const links = sidebar.getByRole('link');
        await expect(links).toHaveText(current.slice(0, 8));
        await links.first().focus();
        for (const [index, path] of order.entries()) {
          await expect(sidebar.locator(`a[href="${path}"]`)).toBeFocused();
          if (index < order.length - 1) await page.keyboard.press('Tab');
        }
        await fitsPage(page);

        for (const path of order) {
          const link = sidebar.locator(`a[href="${path}"]`);
          await link.click();
          await expect(page).toHaveURL(url => url.pathname === path);
          await expect(link).toHaveAttribute('aria-current', 'page');
        }
        return;
      }

      await expect(bottom.getByRole('link')).toHaveText([...current.slice(0, 3), current[8]]);
      for (const path of order.slice(0, 3)) {
        const link = bottom.locator(`a[href="${path}"]`);
        await activate(link, info);
        await expect(page).toHaveURL(url => url.pathname === path);
        await expect(link).toHaveAttribute('aria-current', 'page');
      }
      // Messages fills the phone screen. Its back link returns to the parent shell.
      await activate(page.locator('app-messages-page a[href="/"]'), info);

      const more = bottom.locator('a[href="/more"]');
      const menu = page.locator('app-more-page');
      await activate(more, info);
      await expect(more).toHaveAttribute('aria-current', 'page');
      await expect(menu.getByRole('link')).toHaveText(current.slice(3, 8));
      await fitsPage(page);
      await evidence(page, info, `more-${language}`);
      for (const path of order.slice(3)) {
        await activate(menu.locator(`a[href="${path}"]`), info);
        await expect(page).toHaveURL(url => url.pathname === path);
        await expect(more).toHaveAttribute('aria-current', 'location');
        await page.goBack();
        await expect(page).toHaveURL(url => url.pathname === '/more');
        await expect(more).toHaveAttribute('aria-current', 'page');
      }
    } finally {
      await dad.dispose();
    }
  });
}
