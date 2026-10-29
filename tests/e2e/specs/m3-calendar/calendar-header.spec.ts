import { expect, type Locator, type Page } from '@playwright/test';
import { test, activate, evidence, signIn } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';

// #372: the Calendar header's buttons line up, and page content scrolls under the bottom navigation. Synthetic data.
const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);

/** The 4th Monday of a future month (the 22nd to 28th), so its Month row sits low enough to scroll under the navigation. */
const lateMonday = (() => {
  const later = addHours(monday, 24 * 40);
  const first = new Date(Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), 1));
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 + ((8 - first.getUTCDay()) % 7) + 21));
})();

/** Vertical centres of a button's icon and of its text, measured with a DOM range around the label text. */
async function centres(button: Locator) {
  return button.evaluate(el => {
    const icon = el.querySelector('.app-icon')!.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && !node.textContent!.trim());
    const range = document.createRange();
    range.selectNodeContents(node!);
    const text = range.getBoundingClientRect();
    return { icon: icon.top + icon.height / 2, text: text.top + text.height / 2 };
  });
}

async function headerLinesUp(page: Page) {
  const add = page.getByRole('link', { name: 'Add', exact: true });
  const approvals = page.getByRole('link', { name: 'Approvals', exact: true });
  const c = await centres(add);
  expect(Math.abs(c.icon - c.text), '“+” and “Add” share one centre line').toBeLessThanOrEqual(2);
  const a = (await add.boundingBox())!, b = (await approvals.boundingBox())!;
  expect(Math.abs(a.height - b.height), 'Add and Approvals are the same height').toBeLessThanOrEqual(1);
  expect(Math.abs(a.y - b.y), 'Add and Approvals line up').toBeLessThanOrEqual(1);
}

test.describe('Calendar header and bottom navigation layering', { tag: ['@m3', '@mobile'] }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the Add button’s icon and label line up with Approvals, and there’s no Switch profile pill, ${theme} (#372)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page, family.dad.email);
      await page.goto(`/calendar?date=${date}`);
      await headerLinesUp(page);
      await expect(page.getByRole('banner').getByRole('button', { name: 'Switch profile' })).toHaveCount(0);
      await evidence(page, info, `${theme}-calendar-header`);
    });
  }

  test('with 200% text, the Add button’s icon and label still line up (#372)', async ({ page, family }, info) => {
    await signIn(page, family.dad.email);
    await page.goto(`/calendar?date=${date}`);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const c = await centres(page.getByRole('link', { name: 'Add', exact: true }));
    expect(Math.abs(c.icon - c.text)).toBeLessThanOrEqual(3);
    await evidence(page, info, 'text-enlarged-calendar-header');
  });

  test('a Month bar scrolled to the bottom navigation goes under it, and the navigation still gets the tap (#372)', async ({ page, family }, info) => {
    const members = await family.dad.json<{ members: { membershipId: string; displayName: string }[] }>(family.dad.get(`/api/families/${family.familyId}`));
    const dad = members.members.find(m => m.displayName === 'Dad')!.membershipId;
    await family.dad.json(family.dad.post(`/api/families/${family.familyId}/calendar/events`, {
      category: 'ParentingTime', title: 'Dad time', childIds: [family.kaiId], caregiverMembershipId: dad,
      startsAt: addHours(lateMonday, 24 + 9).toISOString(), endsAt: addHours(lateMonday, 24 * 4 + 17).toISOString(),
    }));
    // A short phone screen, so the late-month row starts below the fold and can scroll under the navigation.
    if (info.project.use.hasTouch) await page.setViewportSize({ width: page.viewportSize()!.width, height: 600 });
    await signIn(page, family.dad.email);
    await page.goto(`/calendar?date=${lateMonday.toISOString().slice(0, 10)}&view=month`);
    const bar = page.locator('app-calendar-month .bar', { hasText: 'Dad time' }).first();
    await expect(bar).toBeVisible();
    const nav = page.locator('nav.bottomnav');
    if (!info.project.use.hasTouch) {
      // Desktop uses the sidebar: there's no bottom navigation for content to overlap.
      await expect(nav).toBeHidden();
      return;
    }

    // Scroll the bar to the middle of the navigation, as in the owner's screenshot.
    const navBox = (await nav.boundingBox())!;
    await bar.evaluate((el, navCentre) => {
      const box = el.getBoundingClientRect();
      window.scrollBy(0, box.top + box.height / 2 - navCentre);
    }, navBox.y + navBox.height / 2);
    const barBox = (await bar.boundingBox())!;
    const overlap = { top: Math.max(barBox.y, navBox.y), bottom: Math.min(barBox.y + barBox.height, navBox.y + navBox.height) };
    expect(overlap.bottom - overlap.top, 'the bar is behind the navigation for this check').toBeGreaterThan(0);

    // What a tap there hits: the navigation, never the calendar bar on top of it.
    const x = barBox.x + Math.min(barBox.width, 40) / 2;
    const y = (overlap.top + overlap.bottom) / 2;
    const hit = await page.evaluate(([px, py]) => {
      const target = document.elementFromPoint(px, py);
      return { inNav: !!target?.closest('nav.bottomnav'), inBar: !!target?.closest('app-calendar-month') };
    }, [x, y] as const);
    expect(hit).toEqual({ inNav: true, inBar: false });
    await evidence(page, info, 'month-bar-under-navigation');
    await activate(nav.getByRole('link', { name: 'Home', exact: true }), info);
    await expect(page).toHaveURL(/\/$/);
  });
});
