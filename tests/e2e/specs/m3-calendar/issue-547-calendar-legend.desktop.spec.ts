import { expect, test } from '@playwright/test';
import { addHours, nextMonday } from '../../support/data';
import { soloParent } from '../../support/family';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const lateEvent = 'Saturday evening pickup';

test('the desktop Calendar legend stays visible and clear of Messages while scrolling (#547)', {
  tag: ['@m4', '@regression'],
}, async ({ page }, info) => {
  const { dad, familyId } = await soloParent();
  try {
    const path = `/api/families/${familyId}/calendar/events`;
    for (const [i, hours] of [15, 20, 39, 44, 63, 87, 111, 135, 148].entries()) {
      await dad.json(dad.post(path, {
        title: hours === 148 ? lateEvent : `Calendar fixture ${i + 1}`,
        category: 'Activity',
        startsAt: addHours(monday, hours).toISOString(),
        endsAt: addHours(monday, hours + 0.5).toISOString(),
      }));
    }
    await page.context().addCookies((await dad.http.storageState()).cookies);
    const legend = page.getByRole('list', { name: 'Calendar key' });
    const minimized = page.getByRole('region', { name: 'Compact chat, minimized' });
    const open = page.getByRole('region', { name: 'Compact chat', exact: true });

    for (const [width, height, colorScheme] of [[1440, 900, 'light'], [1024, 600, 'dark']] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      for (const view of ['week', 'month', 'list'] as const) {
        await page.goto(`/calendar?date=${date}&view=${view}`);
        await expect(legend).toBeInViewport({ ratio: 1 });
        await expect(legend.getByRole('listitem')).toHaveCount(8);
        await expect(legend).toHaveCSS('font-size', '16px');
        await expect(legend.locator('.swatch').first()).toHaveCSS('width', '24px');
        const body = (await page.locator('app-calendar-page .body').boundingBox())!;
        const key = (await legend.boundingBox())!;
        expect(key.x).toBe(body.x);
        expect(key.width).toBeCloseTo(Math.min(0.6 * body.width, body.width - 400), 0);
        expect(key.x + key.width).toBeLessThan((await minimized.boundingBox())!.x);

        const last = view === 'month'
          ? page.locator('app-calendar-month .day__number').last()
          : page.locator(`app-calendar-${view} button.item:visible`).filter({ hasText: lateEvent });
        await last.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect(legend).toBeInViewport({ ratio: 1 });
        expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThan((await legend.boundingBox())!.y);
        await last.click({ trial: true });

        await minimized.getByRole('button', { name: /Open the compact chat/ }).click();
        await expect(open).toBeVisible();
        const dock = (await open.boundingBox())!;
        expect((await legend.boundingBox())!.x + key.width + 15).toBeLessThanOrEqual(dock.x);
        // Scroll the final control into the usable strip above Messages, even when it sits at the far right.
        await last.evaluate((el, dockTop) => {
          const target = el.getBoundingClientRect();
          const top = Math.max(4, (dockTop - target.height) / 2);
          window.scrollBy(0, target.top - top);
        }, dock.y);
        await expect(legend).toBeInViewport({ ratio: 1 });
        const lastBox = (await last.boundingBox())!;
        expect(lastBox.y + lastBox.height).toBeLessThan(dock.y);
        await last.click({ trial: true });
        if (view === 'list') {
          await info.attach(`legend-${colorScheme}-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
        }
        await open.getByRole('button', { name: 'Minimize chat' }).click();
        await expect(minimized).toBeVisible();
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/calendar?date=${date}&view=list`);
    await expect(page.locator('app-calendar-list')).toBeVisible();
    await expect(legend).toHaveCount(0);
    await expect(page.locator('nav.bottomnav')).toBeInViewport();
  } finally {
    await dad.dispose();
  }
});
