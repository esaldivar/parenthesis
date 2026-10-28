import { Page, expect } from '@playwright/test';

/** A parent's six-digit PIN for shared-device setup in these tests (synthetic). */
export const DAD_PIN = '583920';

/**
 * After a password sign-in, a parent with a family is asked "Is this a shared family device?" (#153). Waits until
 * the sign-in page has sent the browser on, and answers "No, continue to my account" if the question is shown, so the
 * test continues to where it was heading. Does nothing when the question isn't asked (no family, an invitation).
 */
export async function continuePrivatelyIfAsked(page: Page): Promise<void> {
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  if (new URL(page.url()).pathname === '/shared-device/setup') {
    await expect(page.getByRole('heading', { level: 1, name: 'Is this a shared family device?' })).toBeVisible();
    await page.getByRole('button', { name: 'No, continue to my account' }).click();
    await page.waitForURL((url) => url.pathname !== '/shared-device/setup');
  }
}
