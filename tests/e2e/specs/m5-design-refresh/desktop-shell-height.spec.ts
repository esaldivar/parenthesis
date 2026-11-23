import { expect } from '@playwright/test';
import { evidence, signIn, test } from '../../support/mobile';

// On a laptop the parent shell fills the window and only its content scrolls. Screen-reader-only labels (the home
// cards' "See all" links) were positioned against the page instead, lengthening it, so the page scrolled and lifted
// the whole shell above an empty strip at the window's bottom.
const pages = ['/', '/calendar', '/messages', '/memories', '/from-your-kids', '/records', '/settings'];

for (const theme of ['light', 'dark'] as const) {
  test(`The parent shell fills a laptop window without scrolling the page (${theme}) @m5 @regression`, async ({ page, family }, info) => {
    test.skip(Boolean(info.project.use.hasTouch), 'Phones and tablets scroll the page itself.');
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1470, height: 745 });
    await signIn(page, family.dad.email);
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const height = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, window: innerHeight }));
      expect(height.page, `${path} keeps the page within the window`).toBeLessThanOrEqual(height.window);
      const bottom = await page.locator('main').evaluate(main => main.getBoundingClientRect().bottom);
      expect(Math.round(bottom), `${path} content reaches the window's bottom`).toBe(height.window);
    }
    await page.goto('/');
    await page.locator('main').evaluate(main => main.scrollTo(0, main.scrollHeight));
    await evidence(page, info, `laptop-home-${theme}`);
  });
}
