import { expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { KAI_PIN, familyWithKai } from '../../support/family';
import { linkFromEmail } from '../../support/mailpit';
import { DAD_PIN } from '../../support/shared-device';

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

  test('three wrong PINs pause the PIN with no email, and a parent resets it at once (#153)', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const tablet = family.dad;
    const attempt = (pin: string) => tablet.post('/api/device/child-session', { childId: family.kaiId, pin });
    try {
      expect((await attempt('1357')).status()).toBe(401);
      expect((await attempt('1358')).status()).toBe(401);
      const third = await attempt('1359');
      expect(third.status()).toBe(423);
      expect((await third.json()).state).toBe('paused');
      // The pause can't be skipped with the right PIN. (Three more wrong PINs after the 10-minute pause lock it and
      // email both parents; the API integration tests cover that with a test clock.)
      expect((await attempt(KAI_PIN)).status()).toBe(423);

      // Either parent resets the PIN at once, no approval; the other parent is told, without the PIN.
      expect((await family.mom.put(`/api/families/${family.familyId}/children/${family.kaiId}/pin`, { pin: '9146' })).status()).toBe(204);
      expect((await attempt('9146')).status()).toBe(204);
      const notice = await linkFromEmail(family.dad.email, "A child's PIN was reset", '/settings');
      expect(notice.pathname).toBe('/settings');
    } finally {
      await family.dispose();
    }
  });

  test('only the parent who set up a shared device enters with their parent PIN there', async () => {
    const family = await familyWithKai({ pin: true, householdDevice: true });
    const { dad, mom, familyId } = family;
    try {
      const picker = await dad.json<{ profiles: { kind: string; id: string; name: string }[] }>(dad.get('/api/device/profiles'));
      expect(picker.profiles.map((p) => `${p.kind}:${p.name}`)).toEqual(['parent:Dad', 'child:Kai']);
      const dadTile = picker.profiles.find((p) => p.kind === 'parent')!;
      expect((await mom.post(`/api/families/${familyId}/devices/household`, { name: "Mom's phone", pin: '740361' })).status()).toBe(201);

      // Switch profile ends Dad's session but keeps the picker; his PIN brings him back.
      expect((await dad.post('/api/device/switch')).status()).toBe(204);
      await dad.refreshAntiforgery();
      expect((await dad.get('/api/me')).status()).toBe(401);
      expect((await dad.post('/api/device/parent-session', { membershipId: dadTile.id, pin: '111222' })).status()).toBe(401);
      expect((await dad.post('/api/device/parent-session', { membershipId: dadTile.id, pin: DAD_PIN })).status()).toBe(204);
      await dad.refreshAntiforgery();
      expect((await dad.get('/api/me')).status()).toBe(200);
    } finally {
      await family.dispose();
    }
  });
});
