import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { findHeading } from './voiceover-helpers';

test('VoiceOver reads parent navigation names and follows Calendar and Settings', async ({ page, family, reader, voiceOver }) => {
  expect(family.familyId).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  const nav = page.locator('.sidenav').getByRole('list');
  for (const [name, path] of [
    ['Home', '/'], ['Calendar', '/calendar'], ['Messages', '/messages'],
    ['From Your Kids', '/from-your-kids'], ['Family Memories', '/memories'],
    ['Child Essentials', '/child-essentials'], ['Settings', '/settings'],
  ] as const) {
    const link = nav.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', path);
    await reader.tabTo(link, new RegExp(name, 'i'), /\blink\b/i);
  }
  await reader.checkpoint('Settings activation');
  await voiceOver.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
  const settings = nav.getByRole('link', { name: 'Settings', exact: true });
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await reader.tabTo(page.getByRole('link', { name: 'Notifications', exact: true }), /notifications/i, /link/i, 'Shift+Tab');
  await reader.tabTo(page.getByRole('button', { name: /Dad.*account menu/ }), /dad.*account menu/i, /button/i);
  await reader.tabTo(settings, /settings/i, /link/i);
  // VoiceOver says aria-current="page" as "current page".
  await reader.heard(/current page/i);
  await reader.tabTo(nav.getByRole('link', { name: 'Calendar', exact: true }), /calendar/i, /link/i, 'Shift+Tab');
  await reader.checkpoint('Calendar activation');
  await voiceOver.press('Enter');
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(nav.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page');
  await voiceOver.navigateToWebContent();
  await findHeading(voiceOver, reader, /\bcalendar\b/i);
});
