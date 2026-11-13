import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { addHours, nextMonday } from '../support/data';
import { isoDate, readUntil } from './voiceover-helpers';

interface Task { id: string; completedAt: string | null; progressDone: number; progressTotal: number }

test('VoiceOver reads task state, checklist progress and completion without focus theft', async ({ page, family, reader, voiceOver }) => {
  const monday = nextMonday();
  const due = isoDate(addHours(monday, 24));
  const title = 'VoiceOver packing list';
  const task = await family.dad.json<Task>(family.dad.post(`/api/families/${family.familyId}/calendar/tasks`, {
    title, dueDate: due, childId: family.kaiId,
    items: [{ text: 'Pack the jersey', required: false }, { text: 'Pack the water bottle', required: false }],
  }));
  expect(task.progressTotal).toBe(2);
  await page.goto(`/calendar?date=${due}&view=list`);
  const opener = page.locator('app-calendar-list').getByRole('button', { name: new RegExp(title) });
  await expect(opener).toBeVisible();
  await page.bringToFront();
  await voiceOver.navigateToWebContent();
  await reader.tabTo(opener, /voiceover packing list/i, /button/i);
  await reader.checkpoint('Task details open');
  await voiceOver.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  await reader.heard(/voiceover packing list/i);
  // State and progress are read with VoiceOver's own cursor: they're text, not Tab stops.
  await expect(dialog.locator('.status')).toHaveText('To do');
  await readUntil(voiceOver, reader, /\bto do\b/i);
  await readUntil(voiceOver, reader, /0 of 2 done/i);

  const first = dialog.getByRole('checkbox', { name: /Pack the jersey/ });
  const second = dialog.getByRole('checkbox', { name: /Pack the water bottle/ });
  await reader.tabTo(first, /pack the jersey/i, /check ?box/i);
  await reader.heard(/unchecked|not checked/i);
  await reader.checkpoint('Tick the first item');
  await voiceOver.press('Space');
  await expect(first).toBeChecked();
  await expect(first).toBeFocused();
  await reader.heard(/\bchecked\b/i);
  await expect(dialog.locator('#task-progress')).toHaveText('1 of 2 done');
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '1');
  await readUntil(voiceOver, reader, /1 of 2 done/i, 'previous');

  await reader.tabTo(second, /pack the water bottle/i, /check ?box/i);
  await reader.checkpoint('Tick the last item');
  await voiceOver.press('Space');
  await expect(second).toBeChecked();
  await expect(second).toBeFocused();
  // The polite completion message, said once without moving focus.
  await reader.heard(/great teamwork/i);
  await expect(dialog.locator('.status')).toHaveText('Done');
  await expect(dialog.locator('#task-progress')).toHaveText('2 of 2 done');
  await readUntil(voiceOver, reader, /\bdone\b/i, 'previous');
  const saved = await family.dad.json<Task>(family.dad.get(`/api/families/${family.familyId}/calendar/tasks/${task.id}`));
  expect(saved.completedAt, 'Ticking every item completes the task').not.toBeNull();
  expect(saved.progressDone).toBe(2);
});
