import { expect } from '@playwright/test';
import { test } from './app-fixture';
import { addHours, nextMonday } from '../support/data';

test('NVDA opens an event, traps dialog focus, cancels confirmation and restores focus', async ({ page, family, reader, nvda }) => {
  const monday = nextMonday();
  const title = 'NVDA keyboard practice';
  const event = await family.dad.json<{ id: string; status: string }>(family.dad.post(
    `/api/families/${family.familyId}/calendar/events`, {
      category: 'Activity', title, childIds: [family.kaiId],
      startsAt: addHours(monday, 40).toISOString(), endsAt: addHours(monday, 41).toISOString(),
    },
  ));
  expect(event.status).toBe('Confirmed');
  await page.goto(`/calendar?date=${monday.toISOString().slice(0, 10)}&view=list`);
  const opener = page.locator('app-calendar-list').getByRole('button', { name: new RegExp(title) });
  await expect(opener).toBeVisible();
  await page.bringToFront();
  await nvda.navigateToWebContent();
  await reader.tabTo(page.getByRole('button', { name: 'Next list', exact: true }), /next list/i, /button/i);
  await reader.tabTo(opener, /NVDA keyboard practice/i, /button/i);
  await reader.checkpoint('Event dialog opens');
  await nvda.press('Enter');
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  await reader.heard(/NVDA keyboard practice/i);
  await reader.heard(/dialog/i);
  const close = dialog.getByRole('button', { name: 'Close details', exact: true });
  const edit = dialog.getByRole('link', { name: 'Edit event', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Cancel event…', exact: true });
  await reader.tabTo(close, /close details/i, /button/i);
  await reader.tabTo(edit, /edit event/i, /link/i);
  await reader.tabTo(cancel, /cancel event/i, /button/i);
  // Assert both trap boundaries explicitly; tabTo alone could wrap through the whole page.
  await reader.checkpoint('Forward dialog boundary');
  await nvda.press('Tab');
  await expect(close).toBeFocused();
  await reader.heard(/close details/i);
  await nvda.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await reader.checkpoint('Cancel confirmation');
  await nvda.press('Enter');
  const keep = dialog.getByRole('button', { name: 'Keep it', exact: true });
  await expect(keep).toBeFocused();
  await reader.heard(/keep it/i);
  await reader.heard(/removes it from the calendar for both of you/i);
  await nvda.press('Enter');
  await expect(cancel).toBeFocused();
  await reader.checkpoint('Escape closes details');
  await nvda.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await reader.checkpoint('Reopen and close by named button');
  await nvda.press('Enter');
  await expect(dialog).toBeVisible();
  await reader.tabTo(close, /close details/i, /button/i);
  await nvda.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  const saved = await family.dad.json<{ status: string }>(family.dad.get(
    `/api/families/${family.familyId}/calendar/events/${event.id}`,
  ));
  expect(saved.status, 'Keep it must leave the activity confirmed').toBe('Confirmed');
});
