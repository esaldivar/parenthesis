import { Page, expect, test } from '@playwright/test';
import { PASSWORD } from '../../support/data';
import { KAI_PIN, familyWithKai } from '../../support/family';

/** Signs a parent in through the sign-in page of this browser (its own cookies, separate from the API sessions). */
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

test.describe('Profiles, PINs and approvals in the browser', { tag: '@m2' }, () => {
  test('a parent sets up this device, and a child signs in with their PIN and switches back', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      await test.step('the parent uses this device for the profile picker', async () => {
        await signIn(page, family.dad.email);
        await page.goto('/settings');
        await page.getByLabel('Name this device').fill('Kitchen iPad');
        await page.getByRole('button', { name: 'Use this device' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Kitchen iPad now shows' })).toBeVisible();
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

      await test.step('the child switches profile, and a parent needs their password again', async () => {
        await page.goto('/kid/settings');
        await page.getByRole('button', { name: 'Switch profile' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();
        await page.getByRole('link', { name: /Dad/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Hi, Dad' })).toBeVisible();
        await page.getByLabel('Email').fill(family.dad.email);
        await page.getByLabel('Password').fill(PASSWORD);
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });
    } finally {
      await family.dispose();
    }
  });

  test('a new PIN waits for the co-parent, who approves it in the inbox', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      expect(
        (await family.dad.put(`/api/families/${family.familyId}/children/${family.kaiId}/pin`, { pin: '4826' })).status(),
      ).toBe(202);

      await signIn(page, family.mom.email);
      await page.goto('/settings');
      await expect(page.getByText('New PIN waiting for your co-parent’s approval')).toBeVisible();

      await page.goto('/approvals');
      const request = page.locator('section', { has: page.getByRole('heading', { name: 'Waiting' }) }).getByRole('listitem');
      await expect(request).toContainText("Change Kai's PIN");
      await expect(request).toContainText('Waiting for you');
      await expect(request).toContainText('Proposed by Dad');
      await request.getByRole('button', { name: 'Approve' }).click();

      await expect(page.getByRole('status')).toHaveText('You approved “Change Kai\'s PIN”.');
      await expect(page.getByText('Nothing is waiting for either of you.')).toBeVisible();
      await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Decided' }) })).toContainText('Approved');
    } finally {
      await family.dispose();
    }
  });

  test('a parent pairs a child’s tablet with a code, and the tablet shows only that child', async ({ page }) => {
    const family = await familyWithKai({ pin: true });
    try {
      const { code } = await family.mom.json<{ code: string }>(
        family.mom.post(`/api/families/${family.familyId}/children/${family.kaiId}/pairing-code`, {}),
      );

      await page.goto('/pair');
      await page.getByLabel('Code').fill(code.toLowerCase());
      await page.getByLabel('Name this tablet').fill('Kai’s tablet');
      await page.getByRole('button', { name: 'Set up this tablet' }).click();

      await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Profiles' }).getByRole('listitem')).toHaveCount(1);
      await page.getByRole('link', { name: /Kai/ }).click();
      await page.getByLabel('PIN').fill(KAI_PIN);
      await page.getByRole('button', { name: 'Go' }).click();
      await expect(page).toHaveURL(/\/kid$/);
    } finally {
      await family.dispose();
    }
  });
});
