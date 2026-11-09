import { expect } from '@playwright/test';
import { activate, evidence, test } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const privateNote = 'Synthetic private note for the owner only. '.repeat(23).trim();
const hatch = /repeating-linear-gradient/;

for (const theme of ['light', 'dark'] as const) {
  test(`Unavailable details use one heading and hatch the scrollable surface (${theme}) (#554)`, {
    tag: ['@m3', '@regression'],
  }, async ({ page, family }, info) => {
    const { dad, mom, familyId } = family;
    const path = `/api/families/${familyId}/calendar/events`;
    await dad.json(dad.post(path, {
      category: 'Unavailable',
      startsAt: addHours(monday, 39).toISOString(),
      endsAt: addHours(monday, 41).toISOString(),
      notes: privateNote,
    }));
    await dad.json(dad.post(path, {
      category: 'Activity', title: 'Swim lesson',
      startsAt: addHours(monday, 43).toISOString(),
      endsAt: addHours(monday, 44).toISOString(),
    }));
    await page.context().addCookies((await dad.http.storageState()).cookies);
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 620 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const dialog = page.getByRole('dialog', { name: 'Unavailable', exact: true });

    for (const [source, url] of [['Home', `/?week=${date}`], ['Calendar', `/calendar?date=${date}&view=list`]] as const) {
      const unavailable = source === 'Home'
        ? page.locator('app-week-calendar').getByRole('button', { name: /Open details.*unavailable/i })
        : page.locator('app-calendar-list').getByRole('button', { name: /^Unavailable/ });
      await page.goto(url);
      await activate(unavailable, info);
      await expect(dialog.getByRole('heading', { name: 'Unavailable', exact: true })).toBeFocused();
      await expect(dialog.locator('.panel__head').getByText('Unavailable', { exact: true })).toHaveCount(1);
      await expect(dialog.locator('.panel__icon')).toBeVisible();
      await expect(dialog).toHaveCSS('background-image', hatch);
      await expect(dialog.getByText('Confirmed', { exact: true })).toBeVisible();
      await expect(dialog.getByText(privateNote, { exact: false })).toBeVisible();

      const cancel = dialog.getByRole('button', { name: 'Cancel event…', exact: true });
      await cancel.scrollIntoViewIfNeeded();
      await expect.poll(() => dialog.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      await expect(dialog).toHaveCSS('background-image', hatch);
      await expect(dialog.getByRole('link', { name: 'Edit event' })).toBeVisible();
      if (source === 'Calendar') {
        await evidence(page, info, `${theme}-unavailable-scrolled`);
        await activate(cancel, info);
        const keep = dialog.getByRole('button', { name: 'Keep it' });
        await expect(keep).toBeFocused();
        await activate(keep, info);
        await expect(cancel).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }

    await activate(page.getByRole('button', { name: /^Swim lesson/ }), info);
    const activity = page.getByRole('dialog', { name: 'Swim lesson', exact: true });
    await expect(activity).toHaveCSS('background-image', 'none');
    await expect(activity.locator('.panel__type')).toHaveText('Activity');

    await page.context().clearCookies();
    await page.context().addCookies((await mom.http.storageState()).cookies);
    for (const [url, trigger] of [
      [`/?week=${date}`, page.locator('app-week-calendar').getByRole('button', { name: /Open details.*unavailable/i })],
      [`/calendar?date=${date}&view=list`, page.locator('app-calendar-list').getByRole('button', { name: /^Unavailable/ })],
    ] as const) {
      await page.goto(url);
      await activate(trigger, info);
      await expect(dialog).toHaveCSS('background-image', hatch);
      await expect(dialog.getByText('Private details aren’t shared.')).toBeVisible();
      await expect(dialog.getByText('Synthetic private note', { exact: false })).toHaveCount(0);
      await expect(dialog.getByRole('link', { name: 'Edit event' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Cancel event…', exact: true })).toHaveCount(0);
      if (url.startsWith('/calendar')) {
        await evidence(page, info, `${theme}-unavailable-co-parent`);
      }
    }
  });
}
