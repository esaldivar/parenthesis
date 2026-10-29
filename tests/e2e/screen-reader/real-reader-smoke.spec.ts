import { expect } from '@playwright/test';
import { nvdaTest as test } from '@guidepup/playwright';

// Pilot: verify real NVDA announcements before adding Parenthesis journeys.
// Use a navigated document rather than page.setContent() on about:blank so
// Guidepup can locate and focus the browser's titled document.
test('real screen reader announces a named heading', async ({ page, nvda }) => {
  const html = `<!doctype html><html lang="en"><head><title>Parenthesis accessibility pilot</title></head>
    <body><main><h1>Parenthesis accessibility pilot</h1>
    <button type="button" aria-label="Add event">Add event</button></main></body></html>`;
  await page.goto(`data:text/html,${encodeURIComponent(html)}`, { waitUntil: 'load' });
  await expect(page).toHaveTitle('Parenthesis accessibility pilot');
  await expect(page.getByRole('heading', { name: 'Parenthesis accessibility pilot' })).toBeVisible();

  await nvda.navigateToWebContent();
  // Navigate explicitly to the heading so the assertion checks NVDA speech,
  // not only Playwright's DOM accessibility tree.
  await nvda.nextHeading();
  const phrases = await nvda.spokenPhraseLog();
  expect(phrases.join(' ').toLowerCase()).toContain('parenthesis accessibility pilot');
});
