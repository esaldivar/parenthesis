import { expect } from '@playwright/test';
import { pageKeys, voiceOverChannelTest as test } from './voiceover-fixture';
import { ReaderJourney } from './reader-journey';

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
  const reader = new ReaderJourney(voiceOver, 'VoiceOver', true, pageKeys(page));
  try {
    await voiceOver.navigateToWebContent();
    await reader.checkpoint('Next heading');
    await voiceOver.nextHeading();
    await reader.heard(/screen reader control.*heading|heading.*screen reader control/i);
    await reader.checkpoint('Tab to the button');
    await reader.press('Tab');
    await expect(page.getByRole('button', { name: 'Add event' })).toBeFocused();
    await reader.heard(/add event.*button|button.*add event/i);
  } finally {
    await testInfo.attach('screen-reader-speech', { body: await reader.attach(), contentType: 'application/json' });
  }
});
