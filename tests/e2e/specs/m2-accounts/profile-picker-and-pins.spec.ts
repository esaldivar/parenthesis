import { expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { KAI_PIN, familyWithKai } from '../../support/family';
import { linkFromEmail } from '../../support/mailpit';

interface Picker {
  familyName: string;
  profiles: { kind: string; name: string; canSignIn: boolean; locked: boolean }[];
}

test.describe('Profile picker and child PINs', { tag: '@m2' }, () => {
  test('a household device shows the family profiles, and a PIN only works there', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const stranger = await ApiSession.start();
    try {
      const picker = await family.dad.json<Picker>(family.dad.get('/api/device/profiles'));
      expect(picker.familyName).toBe('Rivera Family');
      expect(picker.profiles.find((p) => p.kind === 'child')).toEqual(
        expect.objectContaining({ name: 'Kai', canSignIn: true, locked: false }),
      );

      // An unregistered device sees no picker and can't use the PIN.
      expect((await stranger.get('/api/device/profiles')).status()).toBe(404);
      expect((await stranger.post('/api/device/child-session', { childId: family.kaiId, pin: KAI_PIN })).status()).toBe(403);
    } finally {
      await stranger.dispose();
      await family.dispose();
    }
  });

  test('a child signs in with their PIN and only reaches child-safe endpoints', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const tablet = family.dad;
    try {
      expect((await tablet.post('/api/device/child-session', { childId: family.kaiId, pin: KAI_PIN })).status()).toBe(204);
      const me = await tablet.json<{ firstName: string }>(tablet.get('/api/session/child'));
      expect(me.firstName).toBe('Kai');

      // The parent's session on the device is gone. Children never see approvals or parent-only data.
      expect((await tablet.get('/api/me')).status()).toBe(403);
      expect((await tablet.get(`/api/families/${family.familyId}/approvals`)).status()).toBe(403);
      expect((await tablet.get(`/api/families/${family.familyId}/children`)).status()).toBe(403);
    } finally {
      await family.dispose();
    }
  });

  test('three wrong PINs lock the profile and email both parents until a parent unlocks it', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const tablet = family.dad;
    const attempt = (pin: string) => tablet.post('/api/device/child-session', { childId: family.kaiId, pin });
    try {
      expect((await attempt('1357')).status()).toBe(401);
      expect((await attempt('1358')).status()).toBe(401);
      expect((await attempt('1359')).status()).toBe(423);
      expect((await attempt(KAI_PIN)).status()).toBe(423);

      await linkFromEmail(family.dad.email, "Kai's profile is locked", '/settings');
      await linkFromEmail(family.mom.email, "Kai's profile is locked", '/settings');

      expect((await family.mom.post(`/api/families/${family.familyId}/children/${family.kaiId}/unlock`)).status()).toBe(204);
      expect((await attempt(KAI_PIN)).status()).toBe(204);
    } finally {
      await family.dispose();
    }
  });

  test('changing a PIN waits for the co-parent, and the old PIN works until then', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const { dad, mom, familyId, kaiId } = family;
    try {
      expect((await mom.post(`/api/families/${familyId}/devices/household`, { name: "Mom's phone" })).status()).toBe(201);
      await dad.json(dad.put(`/api/families/${familyId}/children/${kaiId}/pin`, { pin: '9146' }));

      // Not approved yet: the new PIN doesn't work and the old one still does.
      expect((await mom.post('/api/device/child-session', { childId: kaiId, pin: '9146' })).status()).toBe(401);
      expect((await dad.post('/api/device/child-session', { childId: kaiId, pin: KAI_PIN })).status()).toBe(204);

      const [request] = await mom.json<{ id: string; type: string }[]>(mom.get(`/api/families/${familyId}/approvals`));
      expect(request).toBeDefined();
      await mom.json(mom.post(`/api/families/${familyId}/approvals/${request!.id}/approve`, {}));

      expect((await mom.post('/api/device/child-session', { childId: kaiId, pin: '9146' })).status()).toBe(204);
    } finally {
      await family.dispose();
    }
  });
});
