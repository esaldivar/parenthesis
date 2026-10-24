import { Page, expect, test } from '@playwright/test';
import { PASSWORD, addHours, nextMonday } from '../../support/data';
import { familyWithKai } from '../../support/family';

// Issue #259: a repeating event was refused with "Each date would run into the next" when the End date was set to
// when the repeats should stop: every date then lasted until that day. While an event repeats, each date is now one
// day (owner decision, October 23, 2026): the End date follows the start and can't be changed, and the days, how often
// and until when come from Repeat. Synthetic family; dates are next week, so nothing is in the past.

const monday = nextMonday();
const date = (days: number) => addHours(monday, 24 * days).toISOString().slice(0, 10);
const label = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shown = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC' });

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

async function timesInAll(page: Page, count: number) {
  await page.getByLabel('Ends').click();
  await page.getByRole('option', { name: /times/i }).click();
  await page.getByLabel('Times in all').fill(String(count));
}

test.describe('Issue #259: repeating events aren’t refused for running into each other', { tag: ['@regression', '@m3'] }, () => {
  test('an End date chosen first doesn’t stretch every date: each repeat is one day, on desktop and phone', async ({ page }) => {
    const family = await familyWithKai();
    const [tuesday, wednesday] = [date(1), date(2)];
    try {
      await signIn(page, family.dad.email);
      for (const [size, width, height] of [['desktop', 1280, 800], ['phone', 390, 844]] as const) {
        await test.step(size, async () => {
          await page.setViewportSize({ width, height });
          await page.goto(`/calendar/new?date=${tuesday}`);
          await page.getByRole('button', { name: /Activity/ }).click();
          await page.getByLabel('Title').fill(`Swim lessons (${size})`);

          // The owner's steps: the End date set later first, then a daily repeat. Before the fix every date lasted
          // until Wednesday, so each ran into the next and the server refused the whole series.
          const end = page.locator('input[name="endDate"]');
          await page.locator('app-date-field').filter({ hasText: 'End date' }).locator('mat-form-field').click();
          await page.locator(`.mat-calendar-body-cell[aria-label="${label(wednesday)}"]`).click();
          await expect(end).toHaveValue(shown(wednesday));
          await page.getByLabel('How often').click();
          await page.getByRole('option', { name: 'Every day' }).click();
          await expect(end).toHaveValue(shown(tuesday));
          await expect(end).toBeDisabled();
          await timesInAll(page, 4);
          await expect(page.locator('.preview')).toContainText('4 dates:');

          await page.getByRole('button', { name: 'Add to calendar' }).click();
          await expect(page.getByText(/on the calendar on 4 dates/)).toBeVisible();
          await expect(page.getByText('Each date would run into the next')).toHaveCount(0);
        });
      }
    } finally {
      await family.dispose();
    }
  });

  test('every other weekend, Friday to Sunday, is one request: one approval confirms every day', async ({ page, browser }) => {
    const family = await familyWithKai();
    const friday = date(4);
    const momContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${friday}`);
      await page.getByRole('button', { name: /Parenting time/ }).click();
      await page.getByLabel('Kai').check();
      // Custom: every 2 weeks on Friday, Saturday and Sunday, all day, 6 days in all.
      await page.getByLabel('How often').click();
      await page.getByRole('option', { name: 'Custom…' }).click();
      await page.getByLabel('Every').selectOption('2');
      await expect(page.getByRole('checkbox', { name: 'Friday' })).toBeChecked();
      await page.getByRole('checkbox', { name: 'Saturday' }).check();
      await page.getByRole('checkbox', { name: 'Sunday' }).check();
      await timesInAll(page, 6);
      await expect(page.locator('.preview')).toContainText('6 dates:');
      await page.getByRole('button', { name: 'Send for approval' }).click();
      await expect(page.getByText(/Sent to Mom for approval: .* on 6 dates/)).toBeVisible();

      const mom = await momContext.newPage();
      await signIn(mom, family.mom.email);
      await mom.goto('/approvals');
      await expect(mom.getByText(/every 2 weeks on Fri, Sat and Sun, 6 dates: /)).toHaveCount(1);
      await mom.getByRole('button', { name: 'Approve' }).first().click();
      await expect(mom.getByRole('heading', { name: 'Decided' })).toBeVisible();

      // Every day of both weekends is confirmed: Friday to Sunday, and the same two weeks later.
      const from = new Date(Date.parse(`${friday}T00:00:00Z`)).toISOString();
      const to = new Date(Date.parse(`${friday}T00:00:00Z`) + 20 * 86_400_000).toISOString();
      const events = await family.dad.json<{ status: string; category: string }[]>(
        family.dad.get(`/api/families/${family.familyId}/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      );
      const parenting = events.filter((e) => e.category === 'ParentingTime');
      expect(parenting).toHaveLength(6);
      expect(parenting.every((e) => e.status === 'Confirmed')).toBe(true);
    } finally {
      await momContext.close();
      await family.dispose();
    }
  });
});
