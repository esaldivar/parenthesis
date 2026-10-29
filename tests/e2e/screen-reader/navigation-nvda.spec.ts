import { expect } from '@playwright/test';
import { test } from './app-fixture';

test('NVDA reads parent navigation names and follows Calendar and Settings', async ({ page, family, reader, nvda }) => {
  expect(family.familyId).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.bringToFront();
  await nvda.navigateToWebContent();
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
  await nvda.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page');
  await reader.tabTo(page.getByRole('button', { name: 'Notifications', exact: true }), /notifications/i, /button/i);
  await reader.tabTo(page.getByRole('button', { name: /Dad.*account menu/ }), /dad.*account menu/i, /button/i);
  await reader.tabTo(nav.getByRole('link', { name: 'Calendar', exact: true }), /calendar/i, /link/i);
  await reader.checkpoint('Calendar activation');
  await nvda.press('Enter');
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(nav.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page');
  await reader.checkpoint('Calendar heading');
  await nvda.navigateToWebContent();
  await nvda.nextHeading();
  await reader.heard(/calendar.*heading|heading.*calendar/i);
});
