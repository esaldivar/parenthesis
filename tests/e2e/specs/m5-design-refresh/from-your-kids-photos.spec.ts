import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, fitsWidth, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #710: the approved From Your Kids Photos corkboard (Figma 1667:356, 1667:458, 1667:560, 1667:629). The release
// candidate has no From Your Kids API and no development preview, so a parent sees the honest empty board; the
// populated board, gallery and photo detail are covered by unit tests and the PR's development-build screenshots.
// Synthetic family only: Dad adds Aurora and Mom approves her.

for (const theme of ['light', 'dark'] as const) {
  test(`From Your Kids Photos shows the decorated empty corkboard (${theme}) #710 @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const aurora = await dad.json<{ changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Aurora' }));
    await mom.json(mom.post(`/api/families/${familyId}/approvals/${aurora.changeRequestId}/approve`, {}));
    await signIn(page, dad.email);
    await page.goto('/from-your-kids');

    const photos = page.getByRole('button', { name: /^Photos/ });
    await activate(photos, info);
    await expect(photos).toHaveAttribute('aria-current', 'page');
    const board = page.getByRole('region', { name: 'Kai’s photo board' });
    await expect(board).toBeVisible();

    // Decorated: pins and the blank yellow note, and the lavender note, washi tape and star; the phone or desktop art.
    const mobile = !!info.project.use.isMobile;
    const art = await board.locator('.deco').evaluateAll(images => images
      .filter(image => getComputedStyle(image).display !== 'none')
      .map(image => ({ src: image.getAttribute('src'), loaded: (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0 })));
    expect(art).toEqual((mobile
      ? ['pins-note-mobile.svg', 'corner-accents-mobile.svg']
      : ['pins-note.svg', 'corner-accents.svg']).map(name => ({ src: `/art/from-your-kids/photos/${name}`, loaded: true })));
    // No child-name plaque or "No photos shared" message on the board; screen readers still hear that it's empty.
    await expect(board.getByText('No photos shared with you yet.')).toHaveClass(/visually-hidden/);
    await expect(board.locator('.pinned-photo, .post-it')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add photo/i })).toHaveCount(0);

    // The whole framed board is on screen at its approved proportions: wide on desktop, nearly square on phones.
    await fitsWidth(board.locator('.board'), page);
    const box = (await board.locator('.board').boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(mobile ? 358 / 380 : 1065 / 473.333, 1);
    const frame = await board.locator('.board').evaluate(element => getComputedStyle(element).borderImageSource);
    expect(frame).toContain('/art/from-your-kids/photos/corkboard.webp');

    // Desktop shows the soft leaves at the top corners, mirrored inward; phones don't.
    const leaves = page.locator('.background-leaves');
    if (mobile) {
      await expect(leaves.first()).toBeHidden();
    } else {
      await expect(leaves).toHaveCount(2);
      await expect(leaves.nth(0)).toBeVisible();
      expect(await leaves.nth(1).evaluate(element => getComputedStyle(element).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    }
    await expect(page.getByText('Only things Kai chooses to share with you will appear here.')).toBeVisible();

    // Choosing Aurora keeps Photos open for her.
    await activate(page.getByRole('button', { name: /^Aurora/ }), info);
    await expect(page.getByRole('region', { name: 'Aurora’s photo board' })).toBeVisible();
    await expect(photos).toHaveAttribute('aria-current', 'page');

    await fitsPage(page);
    await evidence(page, info, `photos-empty-${theme}`);
    await scan(page, info, `photos-empty-${theme}`);
  });
}

test('From Your Kids Photos board reads in Spanish #710 @m5 @mobile @regression', async ({ page, family }, info) => {
  await signIn(page, family.dad.email);
  await page.goto('/settings');
  await page.getByLabel('Display language').selectOption('es-419');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.goto('/from-your-kids');
  await activate(page.getByRole('button', { name: /^Fotos/ }), info);
  const board = page.getByRole('region', { name: 'Tablero de fotos de Kai' });
  await expect(board).toBeVisible();
  await expect(board.getByText('Aún no han compartido ninguna foto contigo.')).toBeAttached();
  await fitsPage(page);
  await evidence(page, info, 'photos-empty-spanish');
  await page.goto('/settings');
  await page.getByLabel('Idioma de la aplicación').selectOption('en');
});
