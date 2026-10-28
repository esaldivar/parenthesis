import { Page, expect, test } from '@playwright/test';
import { PASSWORD } from '../../support/data';
import { KAI_PIN, familyWithKai } from '../../support/family';
import { linkFromEmail } from '../../support/mailpit';
import { DAD_PIN, continuePrivatelyIfAsked } from '../../support/shared-device';

/** Signs a parent in through the sign-in page of this browser (its own cookies, separate from the API sessions). */
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await continuePrivatelyIfAsked(page);
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

test.describe('Profiles, PINs and approvals in the browser', { tag: '@m2' }, () => {
  test('a parent sets up this device as shared, and a child signs in with their PIN and switches back (#153)', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      await test.step('after signing in, the parent says this is a shared family device and chooses a parent PIN', async () => {
        await page.goto('/sign-in');
        await page.getByLabel('Email').fill(family.dad.email);
        await page.getByLabel('Password').fill(PASSWORD);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Is this a shared family device?' })).toBeVisible();
        await page.getByRole('button', { name: 'Yes, set up sharing' }).click();
        await page.getByLabel('Name this device').fill('Kitchen iPad');
        await page.getByLabel('Choose your parent PIN').fill(DAD_PIN);
        await page.getByLabel('Type your parent PIN again').fill(DAD_PIN);
        await page.getByRole('button', { name: 'Set up sharing' }).click();
        // Straight into the account: no second password prompt.
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });

      await test.step('switching profile shows who can use this device', async () => {
        await page.getByRole('button', { name: 'Account menu' }).click();
        await page.getByRole('menuitem', { name: 'Switch profile' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();
        await expect(page.getByRole('link', { name: /Dad/ })).toBeVisible();
      });

      await test.step('a wrong PIN says how many tries are left', async () => {
        await page.getByRole('link', { name: /Kai/ }).click();
        await page.getByLabel('PIN').fill('1357');
        await page.getByRole('button', { name: 'Go' }).click();
        await expect(page.getByRole('alert')).toHaveText('That PIN didn’t work. 2 tries left.');
      });

      await test.step('the right PIN opens the child’s space, with no parent pages', async () => {
        await page.getByLabel('PIN').fill(KAI_PIN);
        await page.getByRole('button', { name: 'Go' }).click();
        await expect(page).toHaveURL(/\/kid$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Welcome to your space' })).toBeVisible();
        await page.goto('/approvals');
        await expect(page).toHaveURL(/\/kid$/);
      });

      await test.step('the child switches profile, and the parent needs their own PIN to get back in', async () => {
        await page.goto('/kid/settings');
        await page.getByRole('button', { name: 'Switch profile' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();
        await page.getByRole('link', { name: /Dad/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Hi, Dad' })).toBeVisible();
        await page.getByLabel('Parent PIN').fill(DAD_PIN);
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });

      await test.step('back in, the parent can switch profile again without removing the device', async () => {
        await page.getByRole('button', { name: 'Account menu' }).click();
        await expect(page.getByRole('menuitem', { name: 'Switch profile' })).toBeVisible();
        await page.keyboard.press('Escape');
      });
    } finally {
      await family.dispose();
    }
  });

  test('either parent resets a child’s PIN at once, and the other parent is told without the PIN (#153)', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      await signIn(page, family.mom.email);
      await page.goto('/settings');
      const kai = page.locator('app-children-access li', { hasText: 'Kai' });
      await kai.getByRole('button', { name: 'Reset PIN' }).click();
      await expect(kai).toContainText('works straight away and clears any pause or lock');
      await kai.getByLabel(/New PIN for Kai/).fill('4826');
      await kai.getByLabel('Type it again').fill('4826');
      await kai.getByRole('button', { name: 'Reset PIN now' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Kai’s new PIN works now.' })).toBeVisible();

      await linkFromEmail(family.dad.email, "A child's PIN was reset", '/settings');
    } finally {
      await family.dispose();
    }
  });

  test('a parent pairs a child’s tablet with a code, and the tablet opens straight to that child’s PIN', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      const { code } = await family.mom.json<{ code: string }>(
        family.mom.post(`/api/families/${family.familyId}/children/${family.kaiId}/pairing-code`, {}),
      );

      await page.goto('/pair');
      await page.getByLabel('Code').fill(code.toLowerCase());
      await page.getByLabel('Name this tablet').fill('Kai’s tablet');
      await page.getByRole('button', { name: 'Set up this tablet' }).click();

      // A child's own tablet opens straight to that child's PIN (owner decision on #153).
      await expect(page.getByRole('heading', { level: 1, name: 'Hi, Kai' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to profiles' })).toHaveCount(0);
      await page.getByLabel('PIN').fill(KAI_PIN);
      await page.getByRole('button', { name: 'Go' }).click();
      await expect(page).toHaveURL(/\/kid$/);
    } finally {
      await family.dispose();
    }
  });
});
