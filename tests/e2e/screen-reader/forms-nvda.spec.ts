import { expect } from '@playwright/test';
import { test } from './app-fixture';
import { nextMonday } from '../support/data';

test('NVDA announces activity input labels, required state and title validation', async ({ page, family, reader, nvda }) => {
  expect(family.kaiId).toBeTruthy();
  await page.goto(`/calendar/new?date=${nextMonday().toISOString().slice(0, 10)}`);
  await expect(page.getByRole('heading', { name: 'Add to calendar', level: 1 })).toBeVisible();
  await page.bringToFront();
  await nvda.navigateToWebContent();
  await reader.tabTo(page.getByRole('button', { name: /^Activity\b/ }), /activity/i, /button/i);
  await nvda.press('Enter');
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await reader.tabTo(title, /title/i, /edit/i);
  await expect(title).toHaveAttribute('required', '');
  await reader.heard(/required/i);
  await reader.tabTo(page.getByRole('combobox', { name: 'Category', exact: true }), /category/i, /combo/i);
  await reader.tabTo(page.getByLabel('Start date', { exact: true }), /start date/i, /edit/i);
  await reader.tabTo(page.getByLabel('End date', { exact: true }), /end date/i, /edit/i);
  await reader.tabTo(page.getByRole('checkbox', { name: 'Kai', exact: true }), /kai/i, /check/i);
  await reader.tabTo(page.getByRole('textbox', { name: 'Location (optional)', exact: true }), /location.*optional/i, /edit/i);
  await reader.tabTo(page.getByRole('textbox', { name: 'Notes (optional)', exact: true }), /notes.*optional/i, /edit/i);
  const submit = page.getByRole('button', { name: 'Add to calendar', exact: true });
  await reader.tabTo(submit, /add to calendar/i, /button/i);
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/calendar\/events$/.test(new URL(request.url()).pathname)) writes++;
  });
  await reader.checkpoint('Blank title validation');
  await nvda.press('Enter');
  await expect(title).toBeFocused();
  // Material deliberately omits aria-invalid for empty required inputs, which
  // browsers already expose as invalid. Verify that native state and the error association.
  await expect.poll(() => title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(title).toHaveAccessibleDescription('Enter a title.');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a title.' })).toBeVisible();
  await reader.heard(/enter a title/i);
  expect(writes, 'Invalid form must not submit an event').toBe(0);
  await nvda.type('NVDA form correction');
  await expect(title).toHaveValue('NVDA form correction');
  // Native required state clears after correction. The server-validation hint is
  // intentionally retained until another submission in the current application.
  await nvda.press('Tab');
  await expect.poll(() => title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(false);
  await reader.tabTo(page.getByRole('link', { name: 'Cancel', exact: true }), /cancel/i, /link/i);
  await nvda.press('Enter');
  await expect(page).toHaveURL(/\/calendar\?date=/);
  expect(writes).toBe(0);
});
