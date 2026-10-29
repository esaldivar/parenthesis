import { expect, type Locator } from '@playwright/test';
import { nvdaTest as test } from '@guidepup/playwright';
import { familyWithKai } from '../support/family';
import { nextMonday, addHours } from '../support/data';

test.use({ nvdaStartOptions: { capture: true } });

// Opt-in Windows/NVDA pilot. Requires the real local HTTPS app, Postgres and Mailpit.
// Authentication/fixture setup uses the API; the Calendar journey uses real NVDA keys.
test('NVDA announces Calendar, Add, validation and a saved activity', async ({ page, context, nvda, baseURL }, info) => {
  const app = new URL(baseURL!);
  expect(['localhost', '127.0.0.1', '[::1]'], 'Use an isolated local app with synthetic data').toContain(app.hostname);
  expect(app.protocol, 'The app requires HTTPS cookies').toBe('https:');
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(process.env['MAILPIT_URL'] ?? 'http://localhost:8025').hostname);

  const transcript: { stage: string; phrases: string[] }[] = [];
  let stage = 'fixture setup';
  const checkpoint = async (nextStage: string) => {
    transcript.push({ stage, phrases: [...await nvda.spokenPhraseLog()] });
    await nvda.clearSpokenPhraseLog();
    stage = nextStage;
  };
  // Bounded real Tab navigation. DOM focus only tells us when to stop; it never moves focus.
  const tabTo = async (target: Locator, announcement: RegExp) => {
    await expect(target).toBeVisible();
    for (let count = 0; count < 60; count++) {
      await checkpoint(`Tab ${count + 1} toward ${target}`);
      await nvda.press('Tab');
      if (await target.evaluate(element => element === element.ownerDocument.activeElement)) {
        await expect(target).toBeFocused();
        await expect.poll(async () => (await nvda.spokenPhraseLog()).join(' ')).toMatch(announcement);
        return;
      }
    }
    throw new Error(`NVDA could not Tab to ${target} within 60 keys (${stage})`);
  };
  const heading = async (name: RegExp) => {
    for (let count = 0; count < 16; count++) {
      const spoken = await nvda.lastSpokenPhrase();
      if (/\bheading\b/i.test(spoken) && name.test(spoken)) return;
      await nvda.nextHeading();
    }
    throw new Error(`NVDA did not announce the expected heading (${stage})`);
  };

  const family = await familyWithKai();
  try {
    // Transfer this synthetic parent's real cookies, not a fabricated authentication response.
    await context.addCookies((await family.dad.http.storageState()).cookies);
    const date = nextMonday().toISOString().slice(0, 10);
    await page.goto(`/calendar?date=${date}&view=list`);
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('app-calendar-page .body')).toHaveAttribute('aria-busy', 'false');
    await page.bringToFront();

    await test.step('Calendar heading and Add link', async () => {
      await checkpoint('Calendar heading');
      await nvda.navigateToWebContent();
      await heading(/\bcalendar\b/i);
      await checkpoint('Add link');
      await tabTo(page.getByRole('link', { name: 'Add', exact: true }), /\badd\b.*\blink\b|\blink\b.*\badd\b/i);
      await nvda.press('Enter');
      await expect(page).toHaveURL(/\/calendar\/new\?/);
      await expect(page.getByRole('heading', { name: 'Add to calendar', exact: true, level: 1 })).toBeVisible();
    });

    await test.step('Add page and Activity choice', async () => {
      await checkpoint('Add page heading');
      await nvda.navigateToWebContent();
      await heading(/\badd to calendar\b/i);
      await checkpoint('Activity choice');
      await tabTo(page.getByRole('button', { name: /^Activity\b/ }), /\bactivity\b/i);
      await nvda.press('Enter');
      await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
    });

    await test.step('Blank title announces validation and receives focus', async () => {
      await checkpoint('Submit empty title');
      await tabTo(page.getByRole('button', { name: 'Add to calendar', exact: true }), /\badd to calendar\b/i);
      await checkpoint('Title validation');
      await nvda.press('Enter');
      await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
      await expect.poll(async () => (await nvda.spokenPhraseLog()).join(' ').toLowerCase()).toContain('enter a title');
      await expect(page).toHaveURL(/\/calendar\/new\?/);
    });

    const title = 'NVDA pilot activity';
    await test.step('Correct the title and save with NVDA', async () => {
      await checkpoint('Correct title');
      await nvda.type(title);
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
      await tabTo(page.getByRole('checkbox', { name: 'Kai', exact: true }), /\bkai\b/i);
      await nvda.press('Space');
      await expect(page.getByRole('checkbox', { name: 'Kai', exact: true })).toBeChecked();
      await tabTo(page.getByRole('button', { name: 'Add to calendar', exact: true }), /\badd to calendar\b/i);
      await checkpoint('Save confirmation');
      await nvda.press('Enter');
      await expect(page).toHaveURL(/\/calendar\?date=/);
      await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
      // NVDA's punctuation setting may omit the toast's typographic quotation marks.
      // Keep the event name and complete success phrase mandatory.
      await expect.poll(async () => (await nvda.spokenPhraseLog()).join(' ').replace(/[“”"]/g, '').toLowerCase())
        .toContain(`${title.toLowerCase()} is on the calendar`);
      expect(await page.locator('app-toast-host').evaluate(host => host.contains(host.ownerDocument.activeElement)),
        'The success toast must not take keyboard focus').toBe(false);
      const saved = await family.dad.json<{ title: string; status: string }[]>(family.dad.get(
        `/api/families/${family.familyId}/calendar/events`,
        { from: date + 'T00:00:00Z', to: addHours(new Date(date), 48).toISOString() },
      ));
      expect(saved.filter(event => event.title === title)).toEqual([expect.objectContaining({ status: 'Confirmed' })]);
    });
  } finally {
    try {
      transcript.push({ stage, phrases: [...await nvda.spokenPhraseLog()] });
      await info.attach('nvda-calendar-speech', { body: JSON.stringify(transcript, null, 2), contentType: 'application/json' });
    } finally {
      await family.dispose();
    }
  }
});
