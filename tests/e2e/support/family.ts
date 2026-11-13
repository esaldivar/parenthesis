import { expect } from '@playwright/test';
import { ApiSession } from './api';
import { FAMILY_NAME, TIME_ZONE, newEmail } from './data';
import { linkFromEmail } from './mailpit';
import { DAD_PIN } from './shared-device';

export const KAI_PIN = '2580';

export interface Family {
  dad: ApiSession & { email: string };
  mom: ApiSession & { email: string };
  familyId: string;
  kaiId: string;
  dispose(): Promise<void>;
}

/** A parent with a family and nobody else yet. */
export async function soloParent(displayName = 'Dad') {
  const dad = await ApiSession.parent(displayName);
  const family = await dad.json<{ id: string }>(dad.post('/api/families', { name: FAMILY_NAME, timeZone: TIME_ZONE }));
  return { dad, familyId: family.id };
}

/**
 * Dad and Mom, both parents of the Rivera Family, with Kai approved by both (ADR-0006). Optionally Kai has a PIN and
 * Dad's API session is set up as a shared family device (with Dad's parent PIN), which the profile picker needs.
 */
export async function familyWithKai(options: { pin?: boolean; householdDevice?: boolean } = {}): Promise<Family> {
  const { dad, familyId } = await soloParent('Dad');
  const kai = await dad.json<{ id: string; changeRequestId: string }>(
    dad.post(`/api/families/${familyId}/children`, { firstName: 'Kai' }),
  );

  const momEmail = newEmail('Mom');
  expect((await dad.post(`/api/families/${familyId}/invitations`, { email: momEmail })).status()).toBe(202);
  const invite = await linkFromEmail(momEmail, 'invited you', '/register');
  const mom = await ApiSession.parent('Mom', momEmail);
  await mom.json(mom.post('/api/invitations/accept', { token: invite.searchParams.get('token') }));
  await mom.json(mom.post(`/api/families/${familyId}/approvals/${kai.changeRequestId}/approve`, {}));

  if (options.pin) {
    expect((await dad.put(`/api/families/${familyId}/children/${kai.id}/pin`, { pin: KAI_PIN })).status()).toBe(204);
  }
  if (options.householdDevice) {
    // Explicit shared-device setup, with Dad's first parent PIN (#153).
    expect((await dad.post(`/api/families/${familyId}/devices/household`, { name: 'Kitchen iPad', pin: DAD_PIN })).status()).toBe(201);
  }

  return {
    dad,
    mom,
    familyId,
    kaiId: kai.id,
    dispose: async () => {
      await dad.dispose();
      await mom.dispose();
    },
  };
}
