import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #714: the approved From Your Kids Artwork fridge (Figma 1649:367, 1649:472, 1649:577, 1649:649 and 1938:*). The release
// candidate has no From Your Kids API and no development preview, so a parent sees the same sage fridge, empty, with
// an honest message; the fridge with drawings, the gallery and the detail are covered by unit tests and the PR's
// development-build screenshots. Synthetic family only: Dad adds Aurora and Mom approves her.

for (const theme of ['light', 'dark'] as const) {
  test(`From Your Kids Artwork shows the empty sage fridge (${theme}) #714 @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const aurora = await dad.json<{ changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Aurora' }));
    await mom.json(mom.post(`/api/families/${familyId}/approvals/${aurora.changeRequestId}/approve`, {}));
    await signIn(page, dad.email);
    await page.goto('/from-your-kids');

    const artwork = page.getByRole('button', { name: /^Artwork/ });
    await activate(artwork, info);
    await expect(artwork).toHaveAttribute('aria-current', 'page');
    const fridge = page.getByRole('region', { name: 'Kai’s artwork fridge' });
    await expect(fridge).toBeVisible();

    // The same closed sage fridge as with drawings, fully loaded; no drawings, no View all note, no upload action.
    const art = await fridge.locator('.fridge').evaluate(element => getComputedStyle(element).backgroundImage);
    expect(art).toContain('/art/from-your-kids/artwork/fridge.webp');
    const box = (await fridge.locator('.fridge').boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(668 / 1120, 2);
    expect(box.width).toBeGreaterThan(200);
    await expect(fridge.locator('.drawing, .fridge-note')).toHaveCount(0);
    await expect(fridge.getByText('No artwork shared with you yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add (artwork|drawing)/i })).toHaveCount(0);
    await expect(page.getByText('Only things Kai chooses to share with you will appear here.')).toBeVisible();

    // Choosing Aurora keeps Artwork open for her.
    await activate(page.getByRole('button', { name: /^Aurora/ }), info);
    await expect(page.getByRole('region', { name: 'Aurora’s artwork fridge' })).toBeVisible();
    await expect(artwork).toHaveAttribute('aria-current', 'page');

    await fitsPage(page);
    await evidence(page, info, `artwork-empty-${theme}`);
    await scan(page, info, `artwork-empty-${theme}`);
  });
}

test('From Your Kids Artwork fridge reads in Spanish #714 @m5 @mobile @regression', async ({ page, family }, info) => {
  await signIn(page, family.dad.email);
  await page.goto('/settings');
  await page.getByLabel('Display language').selectOption('es-419');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.goto('/from-your-kids');
  await activate(page.getByRole('button', { name: /^Arte/ }), info);
  const fridge = page.getByRole('region', { name: 'Refrigerador de dibujos de Kai' });
  await expect(fridge).toBeVisible();
  await expect(fridge.getByText('Aún no han compartido ningún dibujo contigo.')).toBeVisible();
  await fitsPage(page);
  await evidence(page, info, 'artwork-empty-spanish');
  await page.goto('/settings');
  await page.getByLabel('Idioma de la aplicación').selectOption('en');
});
