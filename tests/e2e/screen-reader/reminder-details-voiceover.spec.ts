import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { addHours, nextMonday } from '../support/data';
import { isoDate, readUntil } from './voiceover-helpers';

test('VoiceOver reads reminder details, confirmation choices and restores focus (#173 #172)', async ({ page, family, reader, voiceOver }) => {
  const monday = nextMonday();
  const title = 'VoiceOver spirit day';
  await family.dad.json(family.dad.post(`/api/families/${family.familyId}/calendar/reminders`, {
    title, startsAt: addHours(monday, 37).toISOString(), allDay: false, childId: family.kaiId,
  }));
  await page.goto(`/calendar?date=${isoDate(monday)}&view=list`);
  const opener = page.locator('app-calendar-list').getByRole('button', { name: new RegExp(title) });
  await expect(opener).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  await reader.tabTo(opener, /voiceover spirit day/i, /button/i);
  await reader.checkpoint('Reminder details open');
  await voiceOver.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  await reader.heard(/voiceover spirit day/i);
  await reader.heard(/dialog/i);
  // Tab doesn't reach the facts; VoiceOver's own cursor reads them in order.
  await readUntil(voiceOver, reader, /\breminder\b/i);
  await readUntil(voiceOver, reader, /\bwhen\b/i);
  await readUntil(voiceOver, reader, /\babout\b/i);
  await readUntil(voiceOver, reader, /\bkai\b/i);
  const close = dialog.getByRole('button', { name: 'Close details', exact: true });
  const edit = dialog.getByRole('link', { name: 'Edit reminder', exact: true });
  const remove = dialog.getByRole('button', { name: 'Delete reminder…', exact: true });
  await reader.tabTo(close, /close details/i, /button/i);
  await reader.tabTo(edit, /edit reminder/i, /link/i);
  await reader.tabTo(remove, /delete reminder/i, /button/i);
  await reader.checkpoint('Delete confirmation');
  await voiceOver.press('Enter');
  const keep = dialog.getByRole('button', { name: 'Keep it', exact: true });
  await expect(keep).toBeFocused();
  await reader.heard(/keep it/i);
  await reader.heard(/deletes the reminder/i);
  await reader.tabTo(dialog.getByRole('button', { name: 'Yes, delete', exact: true }), /yes, delete/i, /button/i, 'Shift+Tab');
  await reader.heard(/deletes the reminder/i);
  await reader.tabTo(keep, /keep it/i, /button/i);
  await reader.checkpoint('Keep it');
  await voiceOver.press('Enter');
  await expect(remove).toBeFocused();
  await reader.heard(/delete reminder/i);
  await reader.checkpoint('Escape closes details');
  await voiceOver.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await reader.heard(/voiceover spirit day/i);
});
