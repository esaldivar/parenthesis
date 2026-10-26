import { expect, type Page, type TestInfo } from '@playwright/test';
import { test, activate, evidence, fitsPage, signIn } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';
import { describedReason } from '../../support/accessibility';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const at = (hours: number) => addHours(monday, hours).toISOString();
const dayLabel = (offset: number) => addHours(monday, offset * 24).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

async function chooseDay(page: Page, info: TestInfo, label: string) {
  const cell = page.locator(`.mat-calendar-body-cell[aria-label="${label}"]`);
  // This test moves at most one week forward; the target can be in the next month.
  if (!(await cell.count())) await activate(page.getByRole('button', { name: 'Next month', exact: true }), info);
  await activate(cell, info);
  await expect(page.locator('mat-calendar')).toHaveCount(0);
}

test.describe('Mobile recovery and family time boundaries', { tag: ['@m3', '@mobile'] }, () => {
  test.setTimeout(120_000);
  test('controlled overflow regression is detected and passes after restoration (#278)', async ({ page }, info) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>Reflow control</title></head><body><main><h1>Reflow control</h1><div id="control">Synthetic control</div></main></body></html>');
    await page.locator('#control').evaluate(el => { el.style.width = '200vw'; });
    await expect(fitsPage(page)).rejects.toThrow();
    await evidence(page, info, 'controlled-overflow-detected');
    await page.locator('#control').evaluate(el => { el.style.width = '100%'; });
    await fitsPage(page);
    await evidence(page, info, 'controlled-overflow-restored');
  });
  for (const theme of ['light', 'dark'] as const) {
    test(`touch Edit and Swap preserve invalid dates until correction, ${theme} (#248 #249)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const activity = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Touch recovery practice', childIds: [family.kaiId], startsAt: at(40), endsAt: at(41),
      }));
      const members = await family.mom.json<{ members: { membershipId: string; displayName: string }[] }>(family.mom.get(`/api/families/${family.familyId}`));
      const parenting = await family.mom.json<{ id: string; changeRequestId: string }>(family.mom.post(path, {
        category: 'ParentingTime', title: 'Touch swap source', childIds: [family.kaiId],
        caregiverMembershipId: members.members.find(m => m.displayName === 'Mom')!.membershipId,
        startsAt: at(88), endsAt: at(89),
      }));
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/approvals/${parenting.changeRequestId}/approve`, {}));
      await signIn(page, family.dad.email);
      const writes: string[] = [];
      page.on('request', request => {
        if (request.url().includes(path) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) writes.push(request.url());
      });
      for (const [kind, id] of [['edit', activity.id], ['swap', parenting.id]] as const) {
        await page.goto(`/calendar/${id}/${kind}`);
        const start = page.locator(`#${kind}-start-date`), end = page.locator(`#${kind}-end-date`);
        const originalEnd = await end.inputValue();
        await activate(start, info);
        await expect(page.locator('mat-calendar')).toBeVisible();
        await chooseDay(page, info, dayLabel(5));
        await expect(start).toBeFocused();
        await expect(end).toHaveValue(originalEnd);
        await describedReason(page, `#${kind}-end-date`, /end|start|before|after/i);
        await activate(page.getByRole('button', { name: kind === 'edit' ? 'Save changes' : 'Continue', exact: true }), info);
        await expect(end).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`/calendar/${id}/${kind}$`));
        await activate(end, info);
        // Keep a positive timed interval on the corrected day.
        await chooseDay(page, info, dayLabel(5));
        await expect(end).toHaveAttribute('aria-invalid', 'false');
        await expect(end).toBeFocused();
        await fitsPage(page);
        await evidence(page, info, `${theme}-touch-${kind}-corrected`);
        await activate(page.getByRole('link', { name: 'Cancel', exact: true }), info);
        await expect(page).toHaveURL(/\/calendar\?date=/);
      }
      expect(writes, 'invalid submit and Cancel must not modify either event or submit a swap').toEqual([]);
      for (const [id, startsAt, endsAt] of [[activity.id, at(40), at(41)], [parenting.id, at(88), at(89)]]) {
        const saved = await family.dad.json<{ startsAt: string; endsAt: string; pendingChange: string }>(family.dad.get(`${path}/${id}`));
        expect(new Date(saved.startsAt).toISOString()).toBe(startsAt);
        expect(new Date(saved.endsAt).toISOString()).toBe(endsAt);
        expect(saved.pendingChange).toBe('None');
      }
    });

    test(`moving and clearing a slot never creates an event, ${theme} (#237)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page, family.dad.email);
      for (const url of [`/calendar?date=${date}`, `/?week=${date}`]) {
        await page.goto(url);
        const mobile = info.project.use.hasTouch;
        const target = (day: string) => mobile
          ? page.locator('.agenda__day').filter({ hasText: new RegExp(day.slice(0, 3)) }).locator('.tap-add__button')
          : page.getByRole('button', { name: new RegExp(`^Add on ${day}`) }).first();
        for (const day of ['Tuesday', 'Wednesday']) {
          const button = target(day);
          if (mobile) await button.tap({ position: { x: 12, y: 12 } });
          else await button.click();
          await expect(page.locator('.slot-pick__button')).toHaveCount(1);
          await expect(page.locator('.slot-pick__button')).toHaveAttribute('aria-label', new RegExp(`^Add on ${day}`));
        }
        await page.keyboard.press('Escape');
        await expect(page.locator('.slot-pick__button')).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/calendar\/new/);
        await evidence(page, info, `${theme}-${url.startsWith('/calendar') ? 'calendar' : 'home'}-slot-cleared`);
      }
      const events = await family.dad.json<unknown[]>(family.dad.get(`/api/families/${family.familyId}/calendar/events`, { from: at(0), to: at(168) }));
      expect(events).toEqual([]);
    });
  }

  // Use next year's transitions so the tests never depend on editing a date in the past.
  const year = new Date().getUTCFullYear() + 1;
  const sunday = (month: number, nth: number) => 1 + ((7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
  const transitions = [
    { name: 'spring forward', month: 2, day: sunday(2, 2), before: '-06:00', after: '-05:00', elapsed: 1 },
    { name: 'fall back', month: 10, day: sunday(10, 1), before: '-05:00', after: '-06:00', elapsed: 3 },
  ];
  for (const transition of transitions) {
    test(`editing across Chicago ${transition.name} preserves local dates and UTC duration (#278)`, async ({ page, family }, info) => {
      const day = `${year}-${String(transition.month + 1).padStart(2, '0')}-${String(transition.day).padStart(2, '0')}`;
      // Avoid ambiguous/nonexistent wall-clock times themselves: 00:30 and 02:30/03:30 bracket the transition.
      const startTime = transition.name === 'spring forward' ? '01:30' : '00:30';
      const endTime = transition.name === 'spring forward' ? '03:30' : '02:30';
      const startsAt = new Date(`${day}T${startTime}:00${transition.before}`).toISOString();
      const endsAt = new Date(`${day}T${endTime}:00${transition.after}`).toISOString();
      const path = `/api/families/${family.familyId}/calendar/events`;
      const event = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: `DST ${transition.name}`, childIds: [family.kaiId], startsAt, endsAt,
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/${event.id}/edit`);
      await expect(page.locator('[formcontrolname="startTime"]')).toHaveValue(startTime);
      await expect(page.locator('[formcontrolname="endTime"]')).toHaveValue(endTime);
      const expectedDay = `${String(transition.month + 1).padStart(2, '0')}/${String(transition.day).padStart(2, '0')}/${year}`;
      await expect(page.locator('#edit-start-date')).toHaveValue(expectedDay);
      await expect(page.locator('#edit-end-date')).toHaveValue(expectedDay);
      await page.getByLabel('Title', { exact: true }).fill(`Verified DST ${transition.name}`);
      const response = page.waitForResponse(r => r.url().endsWith(`${path}/${event.id}`) && r.request().method() === 'PATCH');
      await activate(page.getByRole('button', { name: 'Save changes', exact: true }), info);
      expect((await response).status()).toBe(200);
      const saved = await family.dad.json<{ startsAt: string; endsAt: string }>(family.dad.get(`${path}/${event.id}`));
      expect(new Date(saved.startsAt).toISOString()).toBe(startsAt);
      expect(new Date(saved.endsAt).toISOString()).toBe(endsAt);
      expect(Date.parse(saved.endsAt) - Date.parse(saved.startsAt)).toBe(transition.elapsed * 3_600_000);
      await evidence(page, info, `dst-${transition.name.replace(' ', '-')}`);
    });
  }
});
