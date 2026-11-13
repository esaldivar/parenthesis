import { expect } from '@playwright/test';
import { test } from './voiceover-fixture';
import { addHours, nextMonday } from '../support/data';
import { findHeading, isoDate } from './voiceover-helpers';

test('VoiceOver announces Calendar, Add, validation and a saved activity once without focus theft', async ({ page, family, reader, voiceOver }) => {
  const date = isoDate(nextMonday());
  await page.goto(`/calendar?date=${date}&view=list`);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('app-calendar-page .body')).toHaveAttribute('aria-busy', 'false');
  await page.bringToFront();

  await voiceOver.navigateToWebContent();
  await findHeading(voiceOver, reader, /\bcalendar\b/i);
  await reader.tabTo(page.getByRole('link', { name: 'Add', exact: true }), /\badd\b/i, /\blink\b/i);
  await voiceOver.press('Enter');
  await expect(page).toHaveURL(/\/calendar\/new\?/);
  await expect(page.getByRole('heading', { name: 'Add to calendar', exact: true, level: 1 })).toBeVisible();

  await voiceOver.navigateToWebContent();
  await findHeading(voiceOver, reader, /\badd to calendar\b/i);
  await reader.tabTo(page.getByRole('button', { name: /^Activity\b/ }), /\bactivity\b/i, /button/i);
  await voiceOver.press('Enter');
  const titleField = page.getByLabel('Title', { exact: true });
  await expect(titleField).toBeVisible();

  const submit = page.getByRole('button', { name: 'Add to calendar', exact: true });
  await reader.tabTo(submit, /\badd to calendar\b/i, /button/i);
  await reader.checkpoint('Title validation');
  await voiceOver.press('Enter');
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
  await expect(titleField).toBeFocused();
  await reader.heard(/enter a title/i);
  await expect(page).toHaveURL(/\/calendar\/new\?/);

  const title = 'VoiceOver pilot activity';
  await reader.checkpoint('Correct title');
  await voiceOver.type(title);
  await expect(titleField).toHaveValue(title);
  const kai = page.getByRole('checkbox', { name: 'Kai', exact: true });
  await reader.tabTo(kai, /\bkai\b/i, /check ?box/i);
  await voiceOver.press('Space');
  await expect(kai).toBeChecked();
  await reader.tabTo(submit, /\badd to calendar\b/i, /button/i);
  await reader.checkpoint('Save confirmation');
  await voiceOver.press('Enter');
  await expect(page).toHaveURL(/\/calendar\?date=/);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
  // The polite toast; VoiceOver may drop the typographic quotation marks around the name.
  await expect.poll(async () => (await reader.reader.spokenPhraseLog()).concat(await reader.reader.lastSpokenPhrase())
    .join(' ').replace(/[“”"]/g, '').toLowerCase()).toContain(`${title.toLowerCase()} is on the calendar`);
  expect(await page.locator('app-toast-host').evaluate(host => host.contains(host.ownerDocument.activeElement)),
    'The success toast must not take keyboard focus').toBe(false);
  const saved = await family.dad.json<{ title: string; status: string }[]>(family.dad.get(
    `/api/families/${family.familyId}/calendar/events`,
    { from: date + 'T00:00:00Z', to: addHours(new Date(date), 48).toISOString() },
  ));
  expect(saved.filter(event => event.title === title)).toEqual([expect.objectContaining({ status: 'Confirmed' })]);
});
