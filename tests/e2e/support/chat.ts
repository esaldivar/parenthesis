import { expect, type Page } from '@playwright/test';
import { activate } from './mobile';

// Helpers for the M4 chat specs (#125). Synthetic family only.

export interface Created {
  id: string;
}

/** Saturday a week or more from now, 10:30 to 12:00 Chicago time (16:30 UTC in standard time, 15:30 in daylight time). */
export function nextSaturday(): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7 + ((6 - date.getUTCDay() + 7) % 7));
  date.setUTCHours(17, 0, 0, 0);
  return date;
}

export async function shareFromPicker(page: Page, info: Parameters<typeof activate>[1], search: string, title: string) {
  await activate(page.getByRole('button', { name: 'Share a calendar event' }), info);
  const dialog = page.getByRole('dialog', { name: 'Find a calendar event' });
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  await dialog.getByRole('searchbox').fill(search);
  await expect(dialog.getByRole('status')).toHaveText(/event(s)? found/);
  await activate(dialog.getByRole('button', { name: new RegExp(title) }), info);
  await expect(dialog).toHaveCount(0);
}
