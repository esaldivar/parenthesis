import { expect } from '@playwright/test';
import { voiceOverChannelTest as test } from './voiceover-fixture';

// Real VoiceOver speech without an app server (#443): the macOS host control. Keep the title distinct from the
// heading so the window title can't satisfy the assertion.

test('VoiceOver announces a named heading and button', async ({ page, voiceOver }, testInfo) => {
  const fixtureUrl = 'http://parenthesis.test/screen-reader-smoke';
  await page.route(fixtureUrl, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><title>Parenthesis accessibility pilot</title></head>
      <body><main><h1>Screen reader control</h1>
      <button type="button">Add event</button></main></body></html>`,
  }));
  await page.goto(fixtureUrl, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: 'Screen reader control' })).toBeVisible();
  await page.bringToFront();
  try {
    await voiceOver.navigateToWebContent();
    await voiceOver.clearSpokenPhraseLog();
    await voiceOver.nextHeading();
    await expect.poll(async () => (await voiceOver.spokenPhraseLog()).join(' '),
      { message: 'VoiceOver must announce the control heading' }).toMatch(/screen reader control.*heading|heading.*screen reader control/i);
    await voiceOver.press('Tab');
    await expect(page.getByRole('button', { name: 'Add event' })).toBeFocused();
    await expect.poll(async () => (await voiceOver.spokenPhraseLog()).join(' '),
      { message: 'VoiceOver must announce the named button' }).toMatch(/add event.*button/i);
  } finally {
    await testInfo.attach('screen-reader-speech', {
      body: JSON.stringify(await voiceOver.spokenPhraseLog(), null, 2),
      contentType: 'application/json',
    });
  }
});
