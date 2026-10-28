import { Locator, Page, TestInfo, expect, test as base } from '@playwright/test';
import { familyWithKai, Family } from './family';
import { PASSWORD, TIME_ZONE } from './data';
import { continuePrivatelyIfAsked } from './shared-device';

export const test = base.extend<{ family: Family }>({
  family: async ({}, use) => {
    const family = await familyWithKai();
    try { await use(family); } finally { await family.dispose(); }
  },
});

export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await continuePrivatelyIfAsked(page);
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

/** Touch is used in all mobile profiles; desktop retains mouse/keyboard behavior. */
export async function activate(locator: Locator, info: TestInfo) {
  if (info.project.use.hasTouch) await locator.tap();
  else await locator.click();
}

export async function fitsPage(page: Page) {
  const geometry = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(geometry.content, 'no horizontal page overflow').toBeLessThanOrEqual(geometry.viewport + 1);
}

export async function fitsWidth(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

export async function evidence(page: Page, info: TestInfo, state: string) {
  await info.attach(`${state}-profile`, { body: JSON.stringify({ testedSha: info.config.metadata['testedSha'], profile: info.project.name, browser: info.project.use.browserName, viewport: page.viewportSize(), touch: info.project.use.hasTouch ?? false, familyTimeZone: TIME_ZONE, state }), contentType: 'application/json' });
  await info.attach(`${state}-screen`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
