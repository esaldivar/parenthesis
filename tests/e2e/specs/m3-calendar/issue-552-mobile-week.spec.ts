import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, fitsWidth, test } from '../../support/mobile';
import { addHours, nextMonday, TIME_ZONE } from '../../support/data';

const monday = nextMonday();
const tuesday = addHours(monday, 24).toISOString().slice(0, 10);
const instant = (hours: number) => addHours(monday, hours).toISOString();
const localMidnight = (hours: number) => {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(addHours(monday, hours + 12)).find(part => part.type === 'timeZoneName')!.value;
  return instant(hours - Number(offset.slice(3)));
};

test('Week shows seven aligned days, one multi-day span and individually reachable timed overlaps (#552)', {
  tag: ['@m3', '@regression'],
}, async ({ page, family }, info) => {
  const { dad, familyId, kaiId } = family;
  const path = `/api/families/${familyId}`;
  const { members } = await dad.json<{ members: { membershipId: string; displayName: string }[] }>(dad.get(path));
  const caregiverMembershipId = members.find(member => member.displayName === 'Dad')!.membershipId;
  const add = (body: object) => dad.json(dad.post(`${path}/calendar/events`, body));
  await add({ category: 'ParentingTime', title: 'Long weekend with Dad', allDay: true,
    startsAt: localMidnight(24), endsAt: localMidnight(96), childIds: [kaiId], caregiverMembershipId });
  await add({ category: 'Holiday', title: 'School holiday', allDay: true,
    startsAt: localMidnight(0), endsAt: localMidnight(24) });
  await add({ category: 'Activity', title: 'Piano lesson', childIds: [kaiId],
    startsAt: instant(24 + 15.25), endsAt: instant(24 + 16) });
  await add({ category: 'Activity', title: 'School pickup', childIds: [kaiId],
    startsAt: instant(24 + 15.5), endsAt: instant(24 + 16.5) });
  await add({ category: 'Unavailable', startsAt: instant(17), endsAt: instant(18) });
  await page.context().addCookies((await dad.http.storageState()).cookies);
  const grid = page.locator('app-calendar-week .grid');
  const hours = grid.getByRole('region', { name: /Events by time of day/ });
  const headers = grid.locator('.grid__head');
  const span = grid.getByRole('button', { name: /Long weekend with Dad/ });
  const piano = grid.getByRole('button', { name: /Piano lesson/ });
  const pickup = grid.getByRole('button', { name: /School pickup/ });

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/calendar?date=${tuesday}`);
    await expect(headers).toHaveCount(7);
    for (const header of await headers.all()) await fitsWidth(header, page);
    await fitsPage(page);
    await expect(span).toHaveCount(1);
    await expect(span.locator('..')).toHaveCSS('grid-column-start', '3');
    await expect(span.locator('..')).toHaveCSS('grid-column-end', '6');
    await expect(grid.getByRole('button', { name: /School holiday/ })).toBeVisible();
    const unavailable = grid.locator('.item[data-kind="unavailable"]');
    await expect(unavailable).toHaveCSS('background-image', /repeating-linear-gradient/);

    await piano.scrollIntoViewIfNeeded();
    const a = (await piano.boundingBox())!;
    const b = (await pickup.boundingBox())!;
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
    if (info.project.use.hasTouch) {
      // At 96 px/hour, 15 minutes is 24 px and 45 minutes is 72 px, less the block's 1 px gap.
      expect(b.y - a.y).toBeCloseTo(24, 0);
      expect(a.height).toBeCloseTo(71, 0);
      await expect(page.locator('nav.bottomnav').getByRole('link', { name: 'Calendar' })).toBeInViewport();
    }

    const headerY = (await headers.first().boundingBox())!.y;
    await hours.evaluate(el => el.scrollTop += 96);
    expect((await headers.first().boundingBox())!.y).toBe(headerY);
    await evidence(page, info, `week-${theme}`);

    await activate(piano, info);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Piano lesson' })).toBeVisible();
    await activate(dialog.getByRole('button', { name: 'Close details' }), info);
    await expect(dialog).toHaveCount(0);
    await pickup.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'School pickup' })).toBeVisible();
    await activate(dialog.getByRole('button', { name: 'Close details' }), info);
    await expect(dialog).toHaveCount(0);

    await activate(page.getByRole('button', { name: 'Next week' }), info);
    await expect(span).toHaveCount(0);
    if (info.project.use.hasTouch) await expect(headers).toHaveCount(7);
    await activate(page.getByRole('button', { name: 'Previous week' }), info);
    await expect(span).toBeVisible();
    await activate(page.getByRole('button', { name: 'Kai', exact: true }), info);
    await expect(page.getByRole('button', { name: 'Kai', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(piano).toBeVisible();
    await activate(page.getByRole('button', { name: 'List', exact: true }), info);
    await expect(page.locator('app-calendar-list').getByRole('button', { name: /Piano lesson/ })).toBeVisible();
    await activate(page.getByRole('button', { name: 'Month', exact: true }), info);
    await expect(page.locator('app-calendar-month')).toBeVisible();
    await activate(page.getByRole('button', { name: 'Next month' }), info);
    const today = page.getByRole('button', { name: 'Today', exact: true });
    await activate(today, info);
    await expect(today).toHaveAttribute('aria-disabled', 'true');
  }
});
