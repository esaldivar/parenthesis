import { expect } from '@playwright/test';
import { test, activate, evidence, fitsPage, fitsWidth, signIn } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const dayLabel = (offset: number) => addHours(monday, offset * 24).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

test.describe('Mobile acceptance foundation', { tag: ['@m3', '@mobile'] }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`date recovery and reminder touch selection, ${theme}, reduced motion (#173 #236 #248 #249)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${date}`);
      await activate(page.getByRole('button', { name: /Parenting time/ }), info);
      const start = page.locator('#add-start-date'), end = page.locator('#add-end-date');
      await expect(start).not.toBeEditable();
      await activate(end, info);
      await expect(page.locator('mat-calendar')).toHaveCount(1);
      await activate(page.locator(`.mat-calendar-body-cell[aria-label="${dayLabel(3)}"]`), info);
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      await expect(end).toBeFocused();
      const endBefore = await end.inputValue();
      await activate(start, info);
      await activate(page.locator(`.mat-calendar-body-cell[aria-label="${dayLabel(5)}"]`), info);
      await expect(end).toHaveValue(endBefore);
      await expect(end).toHaveAttribute('aria-invalid', 'true');
      await page.getByLabel('Kai').check();
      await activate(page.getByRole('button', { name: 'Send for approval', exact: true }), info);
      await expect(end).toBeFocused();
      await expect(page).toHaveURL(/\/calendar\/new/);
      await activate(end, info);
      await activate(page.locator(`.mat-calendar-body-cell[aria-label="${dayLabel(5)}"]`), info);
      await expect(end).toHaveAttribute('aria-invalid', 'false');
      await fitsPage(page);
      await evidence(page, info, `${theme}-corrected-dates`);

      // Changing the selected kind must render the reminder form, never create the abandoned parenting request.
      await activate(page.getByRole('button', { name: /Reminder/ }), info);
      await expect(page.locator('app-reminder-form')).toBeVisible();
      await page.getByLabel('Title', { exact: true }).fill('Mobile Spirit Day');
      await fitsWidth(page.getByLabel('Title', { exact: true }), page);
      await activate(page.getByRole('button', { name: 'Add to calendar', exact: true }), info);
      const toast = page.locator('app-toast-host .toast', { hasText: 'Mobile Spirit Day' });
      await fitsWidth(toast, page);
      const nav = await page.locator('nav.bottomnav').boundingBox();
      if (nav) expect((await toast.boundingBox())!.y + (await toast.boundingBox())!.height).toBeLessThanOrEqual(nav.y);
      await evidence(page, info, `${theme}-reminder-toast`);
      await activate(toast.getByRole('button', { name: /Close/ }), info);
      await expect(toast).toHaveCount(0);
      const events = await family.dad.json<unknown[]>(family.dad.get(`/api/families/${family.familyId}/calendar/events`, { from: monday.toISOString(), to: addHours(monday, 7 * 24).toISOString() }));
      expect(events, 'date recovery and kind change never submitted parenting time').toEqual([]);
    });
  }

  test('200% text enlarges content and preserves form reflow and actions (#173 #248 #249)', async ({ page, family }, info) => {
    await signIn(page, family.dad.email);
    await page.goto(`/calendar/new?date=${date}`);
    await page.getByRole('button', { name: /Activity/ }).click();
    const title = page.getByLabel('Title', { exact: true });
    const before = await title.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize));
    // Browser text enlargement proxy, not a viewport-only resize or device scale factor change.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await title.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(before * 1.9);
    await fitsPage(page);
    await fitsWidth(title, page);
    await fitsWidth(page.locator('#add-start-date'), page);
    await page.getByRole('button', { name: 'Add to calendar', exact: true }).scrollIntoViewIfNeeded();
    await fitsWidth(page.getByRole('button', { name: 'Add to calendar', exact: true }), page);
    await evidence(page, info, 'text-enlarged');
  });
  test('Month pending overflow stays reachable and day targets keep approved geometry (#250)', async ({ page, family }, info) => {
    const members = await family.dad.json<{ members: { membershipId: string; displayName: string }[] }>(family.dad.get(`/api/families/${family.familyId}`));
    const caregiver = members.members.find(m => m.displayName === 'Dad')!.membershipId;
    const path = `/api/families/${family.familyId}/calendar/events`;
    for (let i = 0; i < 5; i++) {
      await family.dad.json(family.dad.post(path, { category: 'ParentingTime', title: `Pending mobile ${i}`, childIds: [family.kaiId], caregiverMembershipId: caregiver, startsAt: addHours(monday, 24 + 15 + i).toISOString(), endsAt: addHours(monday, 24 + 16 + i).toISOString() }));
    }
    await signIn(page, family.dad.email);
    await page.goto(`/calendar?date=${date}&view=month`);
    const bars = page.locator('app-calendar-month .bar[data-status="pending"]');
    await expect(bars.first()).toBeVisible();
    expect((await bars.first().boundingBox())!.height).toBeGreaterThanOrEqual(24);
    const number = page.locator('app-calendar-month .day__number').first();
    const box = (await number.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const more = page.locator('app-calendar-month .more--pending').first();
    await expect(more).toHaveAttribute('aria-label', /pending/i);
    await fitsPage(page);
    await evidence(page, info, 'pending-month-overflow');
    await activate(more, info);
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole('button', { name: /Pending mobile 4/ }).first()).toBeVisible();
  });

});
