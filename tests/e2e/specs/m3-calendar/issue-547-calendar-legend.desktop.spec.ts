import { expect, test } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
import { addHours, nextMonday } from '../../support/data';
import { soloParent } from '../../support/family';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const lateEvent = 'Saturday evening pickup';

test('the desktop Calendar key stays visible and clear of Messages while scrolling (#547, #729)', {
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

    const items = legend.getByRole('listitem');
    const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    for (const [width, height, colorScheme] of [[1440, 900, 'light'], [1024, 600, 'dark']] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      for (const view of ['week', 'month', 'list'] as const) {
        await page.goto(`/calendar?date=${date}&view=${view}`);
        // The Quiet Planner key (#729): parenting time by parent, the types, and Proposed and Declined in Week.
        await expect(items.filter({ hasText: /parenting time/i })).toHaveCount(1);
        for (const type of ['Activity', 'Family event', 'Unavailable']) {
          await expect(items.filter({ hasText: type })).toHaveCount(1);
        }
        await expect(items.filter({ hasText: /^(Proposed|Declined)$/ })).toHaveCount(view === 'week' ? 2 : 0);

        // Week and List scroll inside the panel above their pinned key; Month's key sits under its grid (#729).
        const scroller = view === 'week' ? 'app-calendar-week .grid__body' : view === 'list' ? 'app-calendar-list' : 'main';
        if (view === 'month') {
          await page.locator('main').evaluate(main => main.scrollTo(0, main.scrollHeight));
        } else {
          await expect(legend).toBeInViewport({ ratio: 1 });
          const pinned = (await legend.boundingBox())!;
          await page.locator(scroller).evaluate(el => el.scrollTo(0, el.scrollHeight));
          expect((await legend.boundingBox())!.y).toBeCloseTo(pinned.y, 0);
          const panel = (await page.locator('app-calendar-page .panel').boundingBox())!;
          expect(pinned.y + pinned.height).toBeLessThanOrEqual(panel.y + panel.height);
        }
        await expect(legend).toBeInViewport({ ratio: 1 });
        expect(intersects((await legend.boundingBox())!, (await minimized.boundingBox())!)).toBe(false);

        const last = view === 'month'
          ? page.locator('app-calendar-month .day__number').last()
          : page.locator(`app-calendar-${view} button.item:visible`).filter({ hasText: lateEvent });
        await last.scrollIntoViewIfNeeded();
        await expect(legend).toBeInViewport({ ratio: 1 });
        expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThan((await legend.boundingBox())!.y);
        await last.click({ trial: true });

        await minimized.getByRole('button', { name: /Open the compact chat/ }).click();
        await expect(open).toBeVisible();
        const dock = (await open.boundingBox())!;
        // With Messages open, no key entry sits under its panel (#547).
        for (const entry of await items.all()) {
          expect(intersects((await entry.boundingBox())!, dock)).toBe(false);
        }
        // Scroll the final control into the usable strip above Messages, even when it sits at the far right. The strip
        // is inside the view's own scrolling content: the shell never scrolls away to make room. On a short window the
        // open panel leaves no strip tall enough, so the control stays reachable beside the panel instead.
        // The calendar gives the open panel its width (#729). Where that leaves too little room for seven columns, Week
        // shows the chosen day's agenda instead: the late event is on its last day.
        let target = last;
        let area = scroller;
        const narrowWeek = view === 'week' && await page.locator('app-calendar-week').evaluate(el => el.getBoundingClientRect().width < 600);
        if (narrowWeek) {
          await expect(page.locator('app-calendar-week .strip')).toBeVisible();
          await page.locator('app-calendar-week .strip__day').last().click();
          target = page.locator('app-calendar-week .agenda').getByRole('button', { name: new RegExp(lateEvent) });
          area = 'app-calendar-week';
        }
        await target.scrollIntoViewIfNeeded();
        const content = (await page.locator(area).boundingBox())!;
        await target.evaluate((el, [dockTop, contentTop, selector]) => {
          const box = el.getBoundingClientRect();
          const top = Math.max(contentTop + 4, (contentTop + dockTop - box.height) / 2);
          el.closest(selector)!.scrollBy(0, box.top - top);
        }, [dock.y, Math.max(0, content.y), area] as const);
        const lastBox = (await target.boundingBox())!;
        expect(intersects(lastBox, dock)).toBe(false);
        await target.click({ trial: true });
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
