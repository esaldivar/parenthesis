import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { addHours, nextMonday } from '../support/data';
import { dayLabel, isoDate, pickDay, toastHeardOrRead, typedDate } from './voiceover-helpers';

const monday = nextMonday();

test('VoiceOver announces an invalid end date, its reason and the corrected state (#248 #249)', async ({ page, family, reader, voiceOver }) => {
  expect(family.kaiId).toBeTruthy();
  await page.goto(`/calendar/new?date=${isoDate(addHours(monday, 24))}`);
  await expect(page.getByRole('heading', { name: 'Add to calendar', level: 1 })).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  await reader.tabTo(page.getByRole('button', { name: /^Parenting time\b/ }), /parenting time/i, /button/i);
  await reader.press('Enter');
  const start = page.locator('#add-start-date'), end = page.locator('#add-end-date');
  await reader.tabTo(start, /start date/i, /edit text|text|pop.?up|dialog/i);
  await reader.checkpoint('Open the start picker');
  await reader.press('Enter');
  await expect(page.locator('mat-calendar')).toBeVisible();
  // A start after the end leaves the end where it was and marks it invalid (#248).
  await pickDay(page, reader, dayLabel(monday, 4));
  await expect(start).toBeFocused();
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  const kai = page.getByRole('checkbox', { name: 'Kai', exact: true });
  await reader.tabTo(kai, /kai/i, /check ?box/i);
  await reader.press('Space');
  await expect(kai).toBeChecked();
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  await reader.tabTo(page.getByRole('button', { name: 'Send for approval', exact: true }), /send for approval/i, /button/i);
  await reader.checkpoint('Refused send focuses the end date');
  await reader.press('Enter');
  await expect(end).toBeFocused();
  await expect(end).toHaveAccessibleDescription(/after the start/i);
  await reader.heard(/end date/i);
  await reader.heard(/invalid/i);
  // The reason is for screen readers only (#248); VoiceOver reads it as the field's hint.
  await reader.heard(/after the start/i);
  await reader.checkpoint('Open the end picker');
  await reader.press('Enter');
  await expect(page.locator('mat-calendar')).toBeVisible();
  await pickDay(page, reader, dayLabel(monday, 4));
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute('aria-invalid', 'false');
  await expect(end).not.toHaveAccessibleDescription(/after the start/i);
  await reader.heard(/end date/i);
  expect(writes, 'A refused send must not write anything').toBe(0);
});

test('VoiceOver gives typed-date format guidance, a past-date reason and saves the correction (#236)', async ({ page, family, reader, voiceOver }) => {
  expect(family.kaiId).toBeTruthy();
  await page.goto(`/calendar/new?date=${isoDate(addHours(monday, 24))}`);
  await expect(page.getByRole('heading', { name: 'Add to calendar', level: 1 })).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  await reader.tabTo(page.getByRole('button', { name: /^Reminder\b/ }), /reminder/i, /button/i);
  await reader.press('Enter');
  await expect(page.getByRole('form', { name: 'Reminder details' })).toBeVisible();
  const title = page.getByLabel('Title', { exact: true });
  await reader.tabTo(title, /title/i, /edit text|text field/i);
  await reader.type('VoiceOver date reminder');
  const date = page.getByLabel('Date', { exact: true });
  await reader.tabTo(date, /\bdate\b/i, /edit text|text field/i);
  await expect(date).toHaveAccessibleDescription(/Date format: MM\/DD\/YYYY or YYYY-MM-DD/);
  await reader.heard(/date format/i);

  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/calendar\/reminders$/.test(new URL(request.url()).pathname)) writes++;
  });
  await reader.checkpoint('Type a past date');
  await reader.press('Command+a');
  await reader.type('01/02/2020');
  await expect(date).toHaveValue('01/02/2020');
  const submit = page.getByRole('button', { name: 'Add to calendar', exact: true });
  await reader.tabTo(submit, /add to calendar/i, /button/i);
  await reader.checkpoint('Past date refused');
  await reader.press('Enter');
  await expect(date).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a date from today on.' })).toBeVisible();
  await reader.heard(/choose a date from today on/i);
  expect(writes, 'A refused reminder must not be sent').toBe(0);

  await reader.checkpoint('Type a corrected date');
  await reader.press('Command+a');
  const corrected = addHours(monday, 48);
  await reader.type(typedDate(corrected));
  await expect(date).toHaveValue(typedDate(corrected));
  await reader.tabTo(submit, /add to calendar/i, /button/i);
  await reader.checkpoint('Corrected reminder saved');
  await reader.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${isoDate(corrected)}`));
  await toastHeardOrRead(page, voiceOver, reader, /voiceover date reminder.{0,3} is on the calendar/i);
  expect(writes).toBe(1);
});
