import { expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { newEmail } from '../../support/data';
import { soloParent } from '../../support/family';
import { linkFromEmail } from '../../support/mailpit';

// Milestone 2 has no screens for these yet, so they're tested through the release candidate's API, the way the
// app will use them. Add UI journeys here as the screens ship.
test.describe('Family invitations and child profiles', { tag: '@m2' }, () => {
  test('an invited co-parent signs up, accepts and has the same say', async () => {
    const { dad, familyId } = await soloParent('Dad');
    const momEmail = newEmail('Mom');
    let mom: ApiSession | undefined;
    try {
      expect((await dad.post(`/api/families/${familyId}/invitations`, { email: momEmail })).status()).toBe(202);
      const invite = await linkFromEmail(momEmail, 'invited you', '/register');

      mom = await ApiSession.parent('Mom', momEmail);
      await mom.json(mom.post('/api/invitations/accept', { token: invite.searchParams.get('token') }));

      const family = await mom.json<{ members: { displayName: string; role: string }[] }>(
        mom.get(`/api/families/${familyId}`),
      );
      expect(family.members.map((m) => m.displayName)).toEqual(['Dad', 'Mom']);
      expect(family.members.every((m) => m.role === 'Parent')).toBe(true);

      // An invitation works once.
      expect((await mom.post('/api/invitations/accept', { token: invite.searchParams.get('token') })).ok()).toBe(false);
    } finally {
      await dad.dispose();
      await mom?.dispose();
    }
  });

  test('a child added by one parent waits for the other, and is active once both agree', async () => {
    const { dad, familyId } = await soloParent('Dad');
    const momEmail = newEmail('Mom');
    let mom: ApiSession | undefined;
    try {
      const kai = await dad.json<{ id: string; status: string; changeRequestId: string }>(
        dad.post(`/api/families/${familyId}/children`, { firstName: 'Kai' }),
      );
      expect(kai.status).toBe('PendingApproval');
      // Nobody approves their own proposal (ADR-0003).
      expect((await dad.post(`/api/families/${familyId}/approvals/${kai.changeRequestId}/approve`, {})).status()).toBe(409);

      await dad.post(`/api/families/${familyId}/invitations`, { email: momEmail });
      const invite = await linkFromEmail(momEmail, 'invited you', '/register');
      mom = await ApiSession.parent('Mom', momEmail);
      await mom.json(mom.post('/api/invitations/accept', { token: invite.searchParams.get('token') }));

      const inbox = await mom.json<{ id: string; summary: string; canDecide: boolean }[]>(
        mom.get(`/api/families/${familyId}/approvals`),
      );
      expect(inbox).toEqual([expect.objectContaining({ summary: 'Add Kai to the family', canDecide: true })]);

      await mom.json(mom.post(`/api/families/${familyId}/approvals/${kai.changeRequestId}/approve`, {}));

      const children = await dad.json<{ firstName: string; status: string }[]>(dad.get(`/api/families/${familyId}/children`));
      expect(children).toEqual([expect.objectContaining({ firstName: 'Kai', status: 'Active' })]);
    } finally {
      await dad.dispose();
      await mom?.dispose();
    }
  });

  test('a rejected child is never created', async () => {
    const { dad, familyId } = await soloParent('Dad');
    const momEmail = newEmail('Mom');
    let mom: ApiSession | undefined;
    try {
      const kai = await dad.json<{ changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Kai' }));
      await dad.post(`/api/families/${familyId}/invitations`, { email: momEmail });
      const invite = await linkFromEmail(momEmail, 'invited you', '/register');
      mom = await ApiSession.parent('Mom', momEmail);
      await mom.json(mom.post('/api/invitations/accept', { token: invite.searchParams.get('token') }));

      await mom.json(mom.post(`/api/families/${familyId}/approvals/${kai.changeRequestId}/reject`, { comment: 'Not yet' }));

      expect(await dad.json<unknown[]>(dad.get(`/api/families/${familyId}/children`))).toEqual([]);
    } finally {
      await dad.dispose();
      await mom?.dispose();
    }
  });
});
