import { expect } from '@playwright/test';
import { evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// The release build must keep the parent's diary honestly empty until the shared-entry reader is connected.
// Populated interaction coverage runs in component tests and scripts/diary-design-preview.mjs, never a production
// fixture switch. This journey uses the real parent session and existing family authorization.
for (const theme of ['light', 'dark'] as const) {
  test(`Diary keeps the approved blank book and parent-only boundaries (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, family.dad.email);
    await page.goto('/from-your-kids');
    const diary = page.locator('app-kids-diary');
    await expect(diary.getByRole('img', { name: 'Empty diary' })).toBeVisible();
    await expect(diary.locator('button, textarea, input, .mood, .desktop-book, .mobile-sheets')).toHaveCount(0);
    await expect(page.locator('.preview-controls')).toHaveCount(0);
    const blank = diary.locator('.empty-book');
    expect(await blank.evaluate(node => getComputedStyle(node).backgroundImage)).toContain('diary-blank.png');
    const response = await page.request.get('/art/from-your-kids/diary-blank.png');
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(1000);
    await fitsPage(page);
    await scan(page, info, `diary-empty-${theme}`);
    await evidence(page, info, `diary-empty-${theme}`);
  });
}
