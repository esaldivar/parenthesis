import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../support/data';
import { soloParent } from '../../support/family';

// Issue #208: on a desktop-width screen the home calendar left out every all-day event (an all-day activity, a
// holiday, a day of unavailable time), in either theme. Synthetic data; a parent on their own, with no children.

const ZONE = 'America/Chicago';
const local = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONE });
/** Midnight at the start of `date` in the family's time zone, as an instant (UTC−5 in summer, UTC−6 in winter). */
function midnight(date: string): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT-5"
  const hours = Number(offset.replace('GMT', '') || '0');
  return new Date(Date.parse(`${date}T00:00:00Z`) - hours * 3_600_000).toISOString();
}

test.describe('Issue #208: the home calendar shows the week’s events', { tag: ['@regression', '@m3'] }, () => {
  test('all-day, multi-day and timed events show on a desktop-width home page, in light and dark', async ({ page }) => {
    const { dad, familyId } = await soloParent('Dad');
    try {
      // Tomorrow and the day after, in the family's time zone; whichever week they fall in, the home page is sent there.
      const day = local(new Date(Date.now() + 24 * 3600_000));
      const next = local(new Date(Date.now() + 2 * 24 * 3600_000));
      const events = `/api/families/${familyId}/calendar/events`;
      const add = (body: object) => dad.json(dad.post(events, body));
      await add({ category: 'Activity', title: 'Dentist', startsAt: `${day}T15:00:00Z`, endsAt: `${day}T16:00:00Z` });
      await add({ category: 'Activity', title: 'Field trip', startsAt: midnight(day), endsAt: midnight(next), allDay: true });
      await add({ category: 'Holiday', title: 'Teacher workday', startsAt: midnight(day), endsAt: midnight(next), allDay: true });
      await add({ category: 'Activity', title: 'Two-day camp', startsAt: `${day}T13:00:00Z`, endsAt: `${next}T22:00:00Z` });
      await add({ category: 'Unavailable', startsAt: midnight(day), endsAt: midnight(next), allDay: true });

      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(dad.email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('navigation').first()).toBeVisible();

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/?week=${day}`);
        const grid = page.locator('app-week-calendar .grid');
        await expect(grid.getByText('Dentist', { exact: true })).toBeVisible();
        for (const title of ['Field trip', 'Teacher workday', 'Two-day camp', 'You’re unavailable']) {
          await expect(grid.locator('.allday').getByText(title, { exact: true }), `${title} (${scheme})`).toBeVisible();
        }
      }
    } finally {
      await dad.dispose();
    }
  });
});
