import { expect, test } from '@playwright/test';
import { familyWithKai } from '../../support/family';

// Regression for #58: the profile picker on a household device listed both parents. It must show only the parent
// who registered the device, plus the children.
test.describe('Regression #58: profile picker', { tag: ['@regression', '@m2'] }, () => {
  test('each household device shows only the parent who registered it', async () => {
    const family = await familyWithKai({ householdDevice: true });
    const { dad, mom, familyId } = family;
    try {
      expect((await mom.post(`/api/families/${familyId}/devices/household`, { name: "Mom's phone", pin: '740361' })).status()).toBe(201);
      const names = async (session: typeof dad) =>
        (await session.json<{ profiles: { kind: string; name: string }[] }>(session.get('/api/device/profiles'))).profiles.map(
          (p) => `${p.kind}:${p.name}`,
        );

      expect(await names(dad)).toEqual(['parent:Dad', 'child:Kai']);
      expect(await names(mom)).toEqual(['parent:Mom', 'child:Kai']);
    } finally {
      await family.dispose();
    }
  });
});
