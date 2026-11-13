import { expect } from '@playwright/test';
import { nvdaTest as test } from '@guidepup/playwright';

// A minimal deterministic smoke test of REAL screen-reader speech. It does not
// claim to certify Calendar; application-specific journeys follow once the
// desktop host and Guidepup setup are verified.
test('real screen reader announces a named heading', async ({ page, nvda: screenReader }, testInfo) => {
  // Fulfil a real navigation locally: no application server or external network is needed.
  // Keep the title distinct so NVDA's reportTitle cannot satisfy the heading assertion.
  const fixtureUrl = 'http://parenthesis.test/screen-reader-smoke';
  await page.route(fixtureUrl, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><title>Parenthesis accessibility pilot</title></head>
      <body><main><h1>Screen reader control</h1>
      <button type="button" aria-label="Add event">Add event</button></main></body></html>`,
  }));
  await page.goto(fixtureUrl, { waitUntil: 'load' });
  await expect(page).toHaveTitle('Parenthesis accessibility pilot');
  await expect(page.getByRole('heading', { name: 'Screen reader control' })).toBeVisible();

  // Guidepup checks NVDA's foreground-window title BEFORE its own bringToFront().
  // Activate this page first so it does not have to find Chrome by cycling Alt+Escape.
  await page.bringToFront();
  await screenReader.clearSpokenPhraseLog();
  try {
    await screenReader.navigateToWebContent();
    await screenReader.nextHeading();
    await expect.poll(async () => (await screenReader.spokenPhraseLog()).some(phrase => {
      const spoken = phrase.toLowerCase();
      return spoken.includes('screen reader control') && spoken.includes('heading');
    }), { message: 'The real screen reader must announce the control heading' }).toBe(true);
  } finally {
    await testInfo.attach('screen-reader-speech', {
      body: JSON.stringify(await screenReader.spokenPhraseLog(), null, 2),
      contentType: 'application/json',
    });
  }
});




