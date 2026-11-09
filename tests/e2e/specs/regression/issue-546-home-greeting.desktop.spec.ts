import { expect, test } from '@playwright/test';
import { soloParent } from '../../support/family';

const name = 'W'.repeat(48);
const greetings = [
  ['15:00', 'Good morning', '.sunrise'],
  ['20:00', 'Good afternoon', '.full-sun'],
  ['02:00', 'Good evening', '.moon'],
] as const;

test('Home keeps the greeting above the calendar after loading, resizing and scrolling', {
  tag: ['@regression', '@m4'],
}, async ({ page }, testInfo) => {
  const { dad } = await soloParent(name);
  try {
    await page.context().addCookies((await dad.http.storageState()).cookies);
    const welcome = page.locator('.welcome');
    const calendar = page.locator('app-week-calendar');
    const toolbar = calendar.locator('.toolbar');

    async function expectSeparateRows() {
      await expect(toolbar).toBeVisible();
      const header = (await welcome.boundingBox())!;
      const card = (await calendar.boundingBox())!;
      expect(header.y + header.height).toBeLessThan(card.y);
      for (const selector of ['.welcome__artwork', 'h1', '.welcome__sub']) {
        const item = (await welcome.locator(selector).boundingBox())!;
        expect(item.y).toBeGreaterThanOrEqual(header.y);
        expect(item.y + item.height).toBeLessThanOrEqual(header.y + header.height + 1);
      }
    }

    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const [time, greeting, illustration] of greetings) {
        await page.clock.setFixedTime(new Date(`2026-11-09T${time}:00Z`));
        await page.setViewportSize({ width: 1500, height: 760 });
        await page.goto('/');
        await expect(welcome.getByRole('heading')).toHaveText(`${greeting}, ${name}!`);
        await expect(welcome.locator(illustration)).toBeAttached();
        await expectSeparateRows();
      }
    }

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z'));
    await page.reload();
    await expect(welcome.getByRole('heading')).toHaveText(`Good morning, ${name}!`);
    await expectSeparateRows();
    await testInfo.attach('desktop-dark-home', { body: await page.screenshot(), contentType: 'image/png' });

    for (const viewport of [{ width: 1366, height: 768 }, { width: 1500, height: 759 }, { width: 1024, height: 580 }]) {
      await page.setViewportSize(viewport);
      await expectSeparateRows();
      await toolbar.scrollIntoViewIfNeeded();
      await expectSeparateRows();
    }

    const previous = toolbar.getByRole('button', { name: 'Previous week' });
    const today = toolbar.getByRole('button', { name: 'Today' });
    const week = toolbar.getByRole('button', { name: 'Week', exact: true });
    const list = toolbar.getByRole('button', { name: 'List' });
    const month = toolbar.getByRole('button', { name: 'Month' });

    await previous.click();
    await expect(today).toHaveAttribute('aria-disabled', 'false');
    await today.press('Enter');
    await expect(today).toHaveAttribute('aria-disabled', 'true');
    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await week.press('Space');
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await month.press('Enter');
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await expectSeparateRows();

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await expectSeparateRows();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await toolbar.getByRole('link', { name: 'Month' }).press('Enter');
    await expect(page).toHaveURL(/\/calendar\?view=month/);
  } finally {
    await dad.dispose();
  }
});
