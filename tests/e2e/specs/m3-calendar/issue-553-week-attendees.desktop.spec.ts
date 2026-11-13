import { expect } from '@playwright/test';
import { addHours, nextMonday, TIME_ZONE } from '../../support/data';
import { evidence, test } from '../../support/mobile';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const instant = (hours: number) => addHours(monday, hours).toISOString();
const midnight = (hours: number) => {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(addHours(monday, hours + 12)).find(part => part.type === 'timeZoneName')!.value;
  return instant(hours - Number(offset.slice(3)));
};

test('desktop Week shows attendees without clipping short or overlapping events (#553)', {
  tag: ['@m4', '@regression'],
}, async ({ page, family }, info) => {
  const { dad, familyId, kaiId } = family;
  const base = `/api/families/${familyId}`;
  const { members } = await dad.json<{ members: { membershipId: string; displayName: string }[] }>(dad.get(base));
  const dadId = members.find(member => member.displayName === 'Dad')!.membershipId;
  const add = (body: object) => dad.json(dad.post(`${base}/calendar/events`, body));
  const checkIn = await dad.json<{ changeRequestId: string }>(dad.post(`${base}/calendar/events`, {
    title: 'Family check-in', category: 'Joint', childIds: [kaiId], startsAt: instant(39), endsAt: instant(39.25),
  }));
  await family.mom.json(family.mom.post(`${base}/approvals/${checkIn.changeRequestId}/approve`, {}));
  await add({ title: 'Parents-only schedule note', category: 'Activity', startsAt: instant(39), endsAt: instant(40) });
  await add({ title: 'Swim lesson', category: 'Activity', childIds: [kaiId], startsAt: instant(63), endsAt: instant(64) });
  await add({ title: 'School fair', category: 'Activity', childIds: [kaiId], allDay: true,
    startsAt: midnight(0), endsAt: midnight(24) });
  await add({ title: 'Long weekend with Dad', category: 'ParentingTime', childIds: [kaiId], allDay: true,
    caregiverMembershipId: dadId, startsAt: midnight(72), endsAt: midnight(144) });
  await page.context().addCookies((await dad.http.storageState()).cookies);

  const grid = page.locator('app-calendar-week .grid');
  const short = grid.getByRole('button', { name: /^Family check-in/ });
  const noAttendees = grid.getByRole('button', { name: /^Parents-only schedule note/ });
  const swim = grid.getByRole('button', { name: /^Swim lesson/ });
  const allDay = grid.getByRole('button', { name: /^School fair/ });
  const multiDay = grid.getByRole('button', { name: /^Long weekend with Dad/ });

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1152, height: 800 });
    await page.goto(`/calendar?date=${date}`);
    await expect(multiDay.locator('.week-people app-avatar')).toHaveCount(2);
    await expect(multiDay.locator('.week-people app-avatar[title="Dad"]')).toBeVisible();
    for (const event of [swim, allDay, multiDay]) {
      const kai = event.locator('.week-people app-avatar[title="Kai"]');
      await expect(kai).toBeVisible();
      await expect(kai).toHaveText('K');
      await expect(kai.locator('img')).toHaveCount(0);
    }
    await expect(noAttendees.locator('.week-people')).toHaveCount(0);
    await expect(short).toHaveAccessibleName(/Family check-in.*(?:Dad.*Mom|Mom.*Dad).*Kai/);
    const more = short.locator('.people-more');
    await expect(more).toBeVisible();
    await expect(more).toHaveText(/^\+[123]$/);
    await short.scrollIntoViewIfNeeded();
    const block = (await short.boundingBox())!;
    for (const content of [short.locator('.title'), short.locator('.when'), more]) {
      const box = (await content.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(block.y);
      expect(box.y + box.height).toBeLessThanOrEqual(block.y + block.height);
      expect(box.x + box.width).toBeLessThanOrEqual(block.x + block.width + 1);
    }
    expect(await short.locator('.when').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect(block.x + block.width).toBeLessThanOrEqual((await noAttendees.boundingBox())!.x + 1);
    await evidence(page, info, `week-attendees-${theme}`);

    await short.press('Enter');
    const details = page.getByRole('dialog', { name: 'Family check-in' });
    await expect(details.getByText(/^(?:Dad, Mom|Mom, Dad), Kai$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(short).toBeFocused();
    await page.setViewportSize({ width: 2200, height: 800 });
    await expect(short.locator('.week-people app-avatar')).toHaveCount(3);
    await expect(more).toHaveCount(0);
  }
});
