import { expect } from '@playwright/test';
import { fitsPage, signIn, test } from '../../support/mobile';

test('Spanish is available before sign-in and persists across a reload (#534) @m4 @mobile', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Language', { exact: true }).selectOption('es-419');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  await fitsPage(page);
});

for (const theme of ['light', 'dark'] as const) {
  test(`parent routes use the saved Spanish preference (${theme}) #534 @m4 @mobile`, async ({ page, family }) => {
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, family.dad.email);
    await page.goto('/settings');
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/api/me/language') && response.request().method() === 'PUT',
    );
    await page.getByLabel('Display language').selectOption('es-419');
    expect((await saved).ok()).toBeTruthy();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');

    for (const [path, heading] of [
      ['/calendar', 'Calendario'],
      ['/child-essentials', 'Información de tus hijos'],
      ['/memories', 'Recuerdos familiares'],
      ['/shared-records', 'Registros compartidos'],
      ['/notifications', 'Notificaciones'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
      await fitsPage(page);
    }

    await page.goto('/settings');
    await page.getByLabel('Idioma de la aplicación').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
}
