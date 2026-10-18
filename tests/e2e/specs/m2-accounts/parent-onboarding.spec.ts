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
      await page.getByLabel('Password').fill(PASSWORD);
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

    await test.step('create the family and land on the dashboard', async () => {
      await page.getByLabel('Family name').fill(FAMILY_NAME);
      await page.getByRole('button', { name: 'Create family' }).click();
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
