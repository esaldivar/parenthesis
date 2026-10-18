import { expect, test } from '@playwright/test';
import { FAMILY_NAME, PASSWORD, newEmail } from '../../support/data';
import { linkFromEmail } from '../../support/mailpit';

test.describe('Parent onboarding', { tag: '@m2' }, () => {
  test('a parent registers, confirms their email, signs in and creates a family', async ({ page }) => {
    const email = newEmail('Alex Rivera');

    await test.step('register', async () => {
      await page.goto('/register');
      await page.getByLabel('Your name').fill('Alex Rivera');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByLabel('Confirm password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    });

    await test.step('sign-in is refused until the email is confirmed', async () => {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page).toHaveURL(/\/sign-in/);
    });

    await test.step('confirm from the email', async () => {
      const link = await linkFromEmail(email, 'Confirm your email', '/confirm-email');
      await page.goto(link.pathname + link.search);
      await expect(page.getByText(/confirmed/i).first()).toBeVisible();
    });

    await test.step('sign in', async () => {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Alex Rivera' })).toBeVisible();
    });

    await test.step('create the family', async () => {
      await page.getByLabel('Family name').fill(FAMILY_NAME);
      await page.getByRole('button', { name: 'Create family' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Let’s set up your family' })).toBeVisible();
    });

    await test.step('add one child, who waits for the co-parent’s approval', async () => {
      // The count starts at one child.
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Child 1’s first name').fill('Sam');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Children pending approval' })).toBeVisible();
      await expect(page.getByText('Waiting for approval')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
    });

    await test.step('skip the invitation and land on the dashboard', async () => {
      await expect(page.getByRole('heading', { level: 1, name: 'Invite your co-parent' })).toBeVisible();
      await page.getByRole('link', { name: 'Continue to Parenthesis' }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('navigation').first()).toBeVisible();
      // Unbuilt features show honest empty states, never sample data.
      await expect(page.getByText('No messages yet')).toBeVisible();
      await expect(page.getByText(/sample data/i)).toHaveCount(0);
    });
  });

  test('a wrong password is refused without saying whether the account exists', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(newEmail('nobody'));
    await page.getByLabel('Password').fill('not the right password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
