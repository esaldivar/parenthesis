import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { nextMonday } from '../support/data';
import { isoDate } from './voiceover-helpers';

// VoiceOver names text inputs "edit text" and Material selects "pop-up button" (or "combo box" on some releases).
const editText = /edit text|text field/i;

test('VoiceOver announces activity input labels, required state and title validation', async ({ page, family, reader, voiceOver }) => {
  expect(family.kaiId).toBeTruthy();
  await page.goto(`/calendar/new?date=${isoDate(nextMonday())}`);
  await expect(page.getByRole('heading', { name: 'Add to calendar', level: 1 })).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  await reader.tabTo(page.getByRole('button', { name: /^Activity\b/ }), /activity/i, /button/i);
  await voiceOver.press('Enter');
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await reader.tabTo(title, /title/i, editText);
  await expect(title).toHaveAttribute('required', '');
  await reader.heard(/required/i);
  await reader.tabTo(page.getByRole('combobox', { name: 'Category', exact: true }), /category/i, /pop.?up|combo/i);
  await reader.tabTo(page.getByLabel('Start date', { exact: true }), /start date/i, /edit text|text|pop.?up|dialog/i);
  await reader.tabTo(page.getByLabel('End date', { exact: true }), /end date/i, /edit text|text|pop.?up|dialog/i);
  await reader.tabTo(page.getByRole('checkbox', { name: 'Kai', exact: true }), /kai/i, /check ?box/i);
  await reader.tabTo(page.getByLabel('Location (optional)', { exact: true }), /location.*optional/i, /edit text|text field|combo/i);
  await reader.tabTo(page.getByRole('textbox', { name: 'Notes (optional)', exact: true }), /notes.*optional/i, editText);
  const submit = page.getByRole('button', { name: 'Add to calendar', exact: true });
  await reader.tabTo(submit, /add to calendar/i, /button/i);
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/calendar\/events$/.test(new URL(request.url()).pathname)) writes++;
  });
  await reader.checkpoint('Blank title validation');
  await voiceOver.press('Enter');
  await expect(title).toBeFocused();
  await expect.poll(() => title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(title).toHaveAccessibleDescription('Enter a title.');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a title.' })).toBeVisible();
  await reader.heard(/enter a title/i);
  expect(writes, 'Invalid form must not submit an event').toBe(0);
  await reader.checkpoint('Correct title');
  await voiceOver.type('VoiceOver form correction');
  await expect(title).toHaveValue('VoiceOver form correction');
  await voiceOver.press('Tab');
  await expect.poll(() => title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(false);
  await reader.tabTo(page.getByRole('link', { name: 'Cancel', exact: true }), /cancel/i, /link/i);
  await voiceOver.press('Enter');
  await expect(page).toHaveURL(/\/calendar\?date=/);
  expect(writes).toBe(0);
});
