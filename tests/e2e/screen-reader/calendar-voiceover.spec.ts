import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { addHours, nextMonday } from '../support/data';
import { findHeading, isoDate, toastHeardOrRead } from './voiceover-helpers';

test('VoiceOver announces Calendar, Add, validation and a saved activity once without focus theft', async ({ page, family, reader, voiceOver }) => {
  const date = isoDate(nextMonday());
  await page.goto(`/calendar?date=${date}&view=list`);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('app-calendar-page .body')).toHaveAttribute('aria-busy', 'false');
  await page.bringToFront();

  await voiceOver.navigateToWebContent();
  await findHeading(voiceOver, reader, /\bcalendar\b/i);
  await reader.tabTo(page.getByRole('link', { name: 'Add', exact: true }), /\badd\b/i, /\blink\b/i);
  await reader.press('Enter');
  await expect(page).toHaveURL(/\/calendar\/new\?/);
  await expect(page.getByRole('heading', { name: 'Add to calendar', exact: true, level: 1 })).toBeVisible();

  await voiceOver.navigateToWebContent();
  await findHeading(voiceOver, reader, /\badd to calendar\b/i);
  await reader.tabTo(page.getByRole('button', { name: /^Activity\b/ }), /\bactivity\b/i, /button/i);
  await reader.press('Enter');
  const titleField = page.getByLabel('Title', { exact: true });
  await expect(titleField).toBeVisible();

  const submit = page.getByRole('button', { name: 'Add to calendar', exact: true });
  await reader.tabTo(submit, /\badd to calendar\b/i, /button/i);
  await reader.checkpoint('Title validation');
  await reader.press('Enter');
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
  await expect(titleField).toBeFocused();
  await reader.heard(/enter a title/i);
  await expect(page).toHaveURL(/\/calendar\/new\?/);

  const title = 'VoiceOver pilot activity';
  await reader.checkpoint('Correct title');
  await reader.type(title);
  await expect(titleField).toHaveValue(title);
  const kai = page.getByRole('checkbox', { name: 'Kai', exact: true });
  await reader.tabTo(kai, /\bkai\b/i, /check ?box/i);
  await reader.press('Space');
  await expect(kai).toBeChecked();
  await reader.tabTo(submit, /\badd to calendar\b/i, /button/i);
  await reader.checkpoint('Save confirmation');
  await reader.press('Enter');
  await expect(page).toHaveURL(/\/calendar\?date=/);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('app-toast-host .toast')).toBeVisible();
  expect(await page.locator('app-toast-host').evaluate(host => host.contains(host.ownerDocument.activeElement)),
    'The success toast must not take keyboard focus').toBe(false);
  // The polite toast; VoiceOver may drop the typographic quotation marks around the name. Checked after the focus
  // check, because reading it with the VoiceOver cursor can move keyboard focus with it.
  await toastHeardOrRead(page, voiceOver, reader, new RegExp(`${title}.{0,3} is on the calendar`, 'i'));
  const saved = await family.dad.json<{ title: string; status: string }[]>(family.dad.get(
    `/api/families/${family.familyId}/calendar/events`,
    { from: date + 'T00:00:00Z', to: addHours(new Date(date), 48).toISOString() },
  ));
  expect(saved.filter(event => event.title === title)).toEqual([expect.objectContaining({ status: 'Confirmed' })]);
});
