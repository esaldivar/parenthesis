import { expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { PASSWORD, addHours, nextMonday } from '../../support/data';
import { KAI_PIN, familyWithKai } from '../../support/family';

interface CalendarEvent {
  id: string;
  title: string;
  status: string;
  changeRequestId?: string | null;
  notes?: string | null;
}

const monday = nextMonday();
const week = { from: monday.toISOString(), to: addHours(monday, 24 * 7).toISOString() };
const events = (familyId: string) => `/api/families/${familyId}/calendar/events`;
const weekOf = (session: ApiSession, familyId: string) => session.json<CalendarEvent[]>(session.get(events(familyId), week));

test.describe('Shared calendar and approvals', { tag: '@m3' }, () => {
  test('a joint event is a proposal until the co-parent approves it', async () => {
    const family = await familyWithKai();
    const { dad, mom, familyId, kaiId } = family;
    try {
      const proposed = await dad.json<CalendarEvent>(
        dad.post(events(familyId), {
          category: 'Joint',
          title: 'School Play',
          startsAt: addHours(monday, 18).toISOString(),
          endsAt: addHours(monday, 20).toISOString(),
          childIds: [kaiId],
        }),
      );

      // A pending proposal must never look like a confirmed change.
      expect(proposed.status).toBe('PendingApproval');
      expect((await weekOf(mom, familyId)).map((e) => e.status)).toEqual(['PendingApproval']);

      await mom.json(mom.post(`/api/families/${familyId}/approvals/${proposed.changeRequestId}/approve`, {}));

      expect(await weekOf(dad, familyId)).toEqual([expect.objectContaining({ title: 'School Play', status: 'Confirmed' })]);
    } finally {
      await family.dispose();
    }
  });

  // Declined requests stay visible, labelled, until each parent removes them (#199); a withdrawn one just goes.
  test('a declined proposal shows as declined, and a withdrawn one leaves the calendar', async () => {
    const family = await familyWithKai();
    const { dad, mom, familyId, kaiId } = family;
    try {
      const proposed = await dad.json<CalendarEvent>(
        dad.post(events(familyId), {
          category: 'Joint',
          title: 'Parent-teacher night',
          startsAt: addHours(monday, 18).toISOString(),
          endsAt: addHours(monday, 19).toISOString(),
          childIds: [kaiId],
        }),
      );

      const withdrawn = await dad.json<CalendarEvent>(
        dad.post(events(familyId), {
          category: 'Joint',
          title: 'Bake sale',
          startsAt: addHours(monday, 20).toISOString(),
          endsAt: addHours(monday, 21).toISOString(),
          childIds: [kaiId],
        }),
      );

      await mom.json(mom.post(`/api/families/${familyId}/approvals/${proposed.changeRequestId}/reject`, {}));
      expect((await dad.post(`/api/families/${familyId}/approvals/${withdrawn.changeRequestId}/withdraw`)).ok()).toBeTruthy();

      expect(await weekOf(dad, familyId)).toEqual([expect.objectContaining({ title: 'Parent-teacher night', status: 'Rejected' })]);
    } finally {
      await family.dispose();
    }
  });

  test("unavailable time is visible to both parents, but its notes only to its owner", async () => {
    const family = await familyWithKai();
    const { dad, mom, familyId } = family;
    try {
      const created = await dad.post(events(familyId), {
        category: 'Unavailable',
        startsAt: addHours(monday, 8).toISOString(),
        endsAt: addHours(monday, 17).toISOString(),
        notes: 'Work trip',
      });
      expect(created.status()).toBe(201);

      expect((await weekOf(dad, familyId))[0]?.notes).toBe('Work trip');
      const moms = await weekOf(mom, familyId);
      expect(moms).toEqual([expect.objectContaining({ title: 'Unavailable', notes: null })]);
    } finally {
      await family.dispose();
    }
  });

  test('a child sees only confirmed events that include them, and no private notes', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const { dad, familyId, kaiId } = family;
    try {
      const activity = { startsAt: addHours(monday, 17).toISOString(), endsAt: addHours(monday, 18).toISOString() };
      await dad.json(dad.post(events(familyId), { category: 'Activity', title: 'Soccer Practice', childIds: [kaiId], ...activity }));
      await dad.json(dad.post(events(familyId), { category: 'Joint', title: 'Pending Plan', childIds: [kaiId], ...activity }));
      await dad.json(dad.post(events(familyId), { category: 'Unavailable', notes: 'Private', ...activity }));

      // Dad's device becomes Kai's session.
      expect((await dad.post('/api/device/child-session', { childId: kaiId, pin: KAI_PIN })).status()).toBe(204);
      const kaisWeek = await weekOf(dad, familyId);

      expect(kaisWeek.map((e) => e.title)).toEqual(['Soccer Practice']);
      expect(kaisWeek.every((e) => e.notes == null)).toBe(true);
      expect((await dad.post(events(familyId), { category: 'Activity', title: 'Sleepover', childIds: [kaiId], ...activity })).status()).toBe(403);
    } finally {
      await family.dispose();
    }
  });

  test('a parent opens the calendar from the navigation', async ({ page }) => {
    const family = await familyWithKai();
    try {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(family.dad.email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.getByRole('link', { name: 'Calendar' }).first().click();

      await expect(page).toHaveURL(/\/calendar/);
      await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
      // The real calendar (v0.3.0): its views, and nothing claiming it isn't built.
      await expect(page.getByRole('group', { name: 'Calendar view' })).toBeVisible();
      await expect(page.getByText('isn’t available yet')).toHaveCount(0);
    } finally {
      await family.dispose();
    }
  });
});
