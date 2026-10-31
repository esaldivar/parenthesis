import { Page, expect } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { ApiSession } from '../../support/api';
import { scan } from '../../support/accessibility';
import { TIME_ZONE, addHours } from '../../support/data';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';

/** A synthetic two-colour PNG: no faces, no metadata. */
function png(r: number, g: number, b: number, width = 120, height = 90): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Array.from({ length: height }, (_, y) => {
    const [cr, cg, cb] = y < height / 2 ? [r, g, b] : [255 - r, 255 - g, 255 - b];
    return Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [cr, cg, cb]).flat())]);
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The family-local date of an instant, for the calendar's `?date=`. */
const localDate = (instant: Date) => instant.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

async function memories(session: ApiSession, familyId: string) {
  return session.json<{ eventId: string; photoCount: number }[]>(session.get(`/api/families/${familyId}/memories`));
}

async function openEvent(page: Page, eventId: string, start: Date) {
  await page.goto(`/calendar?date=${localDate(start)}&event=${eventId}`);
  const panel = page.getByRole('dialog', { name: 'Soccer final' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Event photos and Family Memories', { tag: ['@m3', '@mobile'] }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`a parent adds private photos to a confirmed event, shares them, and finds them in Family Memories, ${theme} (#403)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      // An activity that has already started: photos open from its start.
      const start = addHours(new Date(), -3);
      const event = await family.dad.json<{ id: string; status: string }>(
        family.dad.post(`/api/families/${family.familyId}/calendar/events`, {
          category: 'Activity', title: 'Soccer final', childIds: [family.kaiId],
          startsAt: start.toISOString(), endsAt: addHours(start, 2).toISOString(),
        }),
      );
      expect(event.status).toBe('Confirmed');

      await signIn(page, family.dad.email);
      let panel = await openEvent(page, event.id, start);
      const photos = panel.locator('app-event-photos');

      await test.step('nothing is uploaded until the parent has seen the privacy and retention note', async () => {
        await expect(photos.getByRole('heading', { name: 'Photos' })).toBeVisible();
        await expect(photos.getByText('No photos yet. Add up to 10 of your own, 5 at a time. Only you see them unless you share them.')).toBeVisible();
        // The visible button opens the system picker; the test hands the files to its input directly.
        await photos.locator('input[type=file]').setInputFiles([
          { name: 'IMG_2041.png', mimeType: 'image/png', buffer: png(220, 40, 40) },
          { name: 'IMG_2042.png', mimeType: 'image/png', buffer: png(40, 80, 220) },
          { name: 'IMG_2043.dng', mimeType: 'image/x-adobe-dng', buffer: Buffer.from('not a photo') },
        ]);
        await expect(photos.getByRole('heading', { name: 'Add photos to Soccer final' })).toBeVisible();
        await expect(photos.getByText('RAW photos (DNG) aren’t supported. Export it as a JPEG and add that instead.')).toBeVisible();
        await expect(photos.locator('.sheet')).toContainText('2 photos will be added. Only you will see them until you turn on Visible to Co-Parent.');
        expect(await memories(family.dad, family.familyId)).toEqual([]);
        await fitsPage(page);
        await scan(page, info, `${theme}-event-photos-review`);
        await evidence(page, info, `${theme}-event-photos-review`);
      });

      await test.step('each photo reports its own result; they stay private', async () => {
        await activate(photos.getByRole('button', { name: 'Add 2 photos' }), info);
        // The live region repeats this text for screen readers; check the visible copy.
        await expect(photos.locator('.sheet p:not(.visually-hidden)', { hasText: 'All 2 photos were added.' })).toBeVisible();
        await activate(photos.getByRole('button', { name: 'Done' }), info);
        await expect(photos.getByRole('button', { name: /^Photo \d of 2, yours$/ })).toHaveCount(2);
        await expect(photos.getByText('Only you', { exact: true })).toBeVisible();
        // Mom sees nothing, not even a count.
        expect(await memories(family.mom, family.familyId)).toEqual([]);
        const momsView = await family.mom.json<{ batches: unknown[] }>(family.mom.get(`/api/families/${family.familyId}/memories/events/${event.id}`));
        expect(momsView.batches).toEqual([]);
        await fitsPage(page);
        await scan(page, info, `${theme}-event-photos-private`);
        await evidence(page, info, `${theme}-event-photos-private`);
      });

      await test.step('turning on Visible to Co-Parent shares them; downloads stay off for Mom', async () => {
        await activate(photos.getByRole('switch', { name: /Visible to Co-Parent, your .+ photos/ }), info);
        await expect(photos.getByText('Shared with Mom', { exact: true })).toBeVisible();
        const shared = await memories(family.mom, family.familyId);
        expect(shared.map((m) => [m.eventId, m.photoCount])).toEqual([[event.id, 2]]);
        const momsView = await family.mom.json<{ batches: { photos: { url: string; downloadUrl: string | null }[] }[] }>(
          family.mom.get(`/api/families/${family.familyId}/memories/events/${event.id}`),
        );
        const first = momsView.batches[0]?.photos[0];
        if (!first) throw new Error('Mom should see the shared photos.');
        expect(first.downloadUrl).toBeNull();
        const viewed = await family.mom.get(first.url);
        expect(viewed.status()).toBe(200);
        expect(viewed.headers()['content-type']).toBe('image/webp');
        expect((await family.mom.get(`${first.url}/download`)).ok()).toBe(false);
      });

      await test.step('Family Memories lists the event, and the memory page shows its photos', async () => {
        await page.goto('/memories');
        await expect(page.getByRole('heading', { level: 1, name: 'Family Memories' })).toBeVisible();
        const row = page.getByRole('link', { name: /Soccer final.*2 photos · You/ });
        await expect(row).toBeVisible();
        await fitsPage(page);
        await scan(page, info, `${theme}-family-memories`);
        await activate(row, info);
        await expect(page.getByRole('heading', { level: 1, name: 'Soccer final' })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Photo \d of 2, yours$/ })).toHaveCount(2);
        await fitsPage(page);
        await scan(page, info, `${theme}-family-memory`);
        await evidence(page, info, `${theme}-family-memory`);
      });

      await test.step('Settings shows Dad’s storage and his download switch, off by default', async () => {
        await page.goto('/settings');
        await expect(page.getByRole('heading', { level: 2, name: 'Memories' })).toBeVisible();
        await expect(page.getByRole('meter', { name: /Your photo storage/ })).toBeVisible();
        await expect(page.getByRole('switch', { name: 'Allow co-parent to download my shared memories' })).not.toBeChecked();
        await fitsPage(page);
        await scan(page, info, `${theme}-memory-settings`);
      });

      await test.step('deleting a photo frees its spot at once', async () => {
        panel = await openEvent(page, event.id, start);
        await activate(panel.getByRole('button', { name: 'Photo 1 of 2, yours' }), info);
        await activate(panel.getByRole('button', { name: 'Delete photo…' }), info);
        await activate(panel.getByRole('button', { name: 'Delete photo', exact: true }), info);
        await expect(panel.getByRole('button', { name: /^Photo 1 of 1, yours$/ })).toBeVisible();
        await expect(panel.getByText('You can add 9 more (1 of your 10 used).', { exact: false })).toBeVisible();
      });
    });
  }

  test('pending events never offer photos, so a proposal can’t look confirmed (#403)', async ({ page, family }) => {
    const members = await family.dad.json<{ members: { membershipId: string; displayName: string }[] }>(family.dad.get(`/api/families/${family.familyId}`));
    const dadId = members.members.find((m) => m.displayName === 'Dad')!.membershipId;
    const start = addHours(new Date(), -3);
    const proposed = await family.dad.json<{ id: string; status: string }>(
      family.dad.post(`/api/families/${family.familyId}/calendar/events`, {
        category: 'ParentingTime', title: 'Soccer final', childIds: [family.kaiId], caregiverMembershipId: dadId,
        startsAt: start.toISOString(), endsAt: addHours(start, 2).toISOString(),
      }),
    );
    expect(proposed.status).toBe('PendingApproval');

    await signIn(page, family.dad.email);
    const panel = await openEvent(page, proposed.id, start);
    await expect(panel.getByText('Photos can be added once this event is confirmed.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Add photos' })).toHaveCount(0);
    const refused = await family.dad.http.fetch(`/api/families/${family.familyId}/memories/events/${proposed.id}/photos`, {
      method: 'POST',
      data: png(10, 10, 10),
      headers: {
        'Content-Type': 'image/png',
        'X-XSRF-TOKEN': (await family.dad.http.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')!.value,
      },
    });
    expect(refused.status()).toBe(409);
  });
});
