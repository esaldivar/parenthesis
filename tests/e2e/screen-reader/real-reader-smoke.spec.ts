import { expect } from '@playwright/test';
import { screenReaderTest as test } from '@guidepup/playwright';

// A minimal deterministic smoke test of REAL screen-reader speech. It does not
// claim to certify Calendar; application-specific journeys follow once the
// desktop host and Guidepup setup are verified.
test('real screen reader announces a named heading', async ({ page, screenReader }) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Parenthesis accessibility pilot</title></head>
    <body><main><h1>Parenthesis accessibility pilot</h1>
    <button type="button" aria-label="Add event">Add event</button></main></body></html>`);
  await expect(page.getByRole('heading', { name: 'Parenthesis accessibility pilot' })).toBeVisible();

  await screenReader.navigateToWebContent();
  const phrases = await screenReader.spokenPhraseLog();
  // Check real announcements rather than DOM-only accessibility metadata.
  expect(phrases.join(' ').toLowerCase()).toContain('parenthesis accessibility pilot');
});
