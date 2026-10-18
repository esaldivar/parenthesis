import { expect, test } from '@playwright/test';
import { soloParent } from '../../support/family';

test.describe('Tenant isolation', { tag: '@m1' }, () => {
  test("a parent from another family can't see or touch this family", async () => {
    const rivera = await soloParent('Dad');
    const other = await soloParent('Jordan Lee');
    try {
      const family = `/api/families/${rivera.familyId}`;

      expect((await other.dad.get(family)).status()).toBe(404);
      expect((await other.dad.get(`${family}/children`)).status()).toBe(404);
      expect((await other.dad.post(`${family}/children`, { firstName: 'Intruder' })).status()).toBe(404);
      expect((await other.dad.get(`${family}/calendar/events`)).status()).toBe(404);

      const mine = await other.dad.json<{ id: string }[]>(other.dad.get('/api/me/families'));
      expect(mine.map((f) => f.id)).toEqual([other.familyId]);
    } finally {
      await rivera.dad.dispose();
      await other.dad.dispose();
    }
  });
});
