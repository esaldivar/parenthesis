import { Locator, Page, expect } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { KAI_PIN } from '../../support/family';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';
import { DAD_PIN } from '../../support/shared-device';
import { scan } from '../../support/accessibility';

/** A synthetic solid-colour PNG: no faces, no metadata. */
function png(r: number, g: number, b: number, size = 96): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED = png(220, 40, 40);
const GREEN = png(40, 160, 70);
const BLUE = png(40, 80, 220);

/** The photo a circle shows, or null when it shows the initial (no image, or the image is hidden on this screen). */
async function shownPhoto(avatar: Locator): Promise<string | null> {
  const img = avatar.locator('img');
  if ((await img.count()) === 0 || !(await img.isVisible())) return null;
  return img.getAttribute('src');
}

async function pickPhoto(page: Page, editor: Locator, file: Buffer, name: string) {
  // The visible button opens the system file picker; the test hands the file to its input directly.
  await editor.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: file });
  await expect(editor.getByText('Preview. It isn’t saved yet.')).toBeVisible();
  await editor.getByRole('button', { name: 'Save photo' }).click();
  await expect(editor.getByRole('status')).toHaveText('Photo saved.');
  await expect(editor.locator('app-avatar img')).toHaveAttribute('src', /^\/api\/families\/.+\/photos\//);
}

const monday = nextMonday();
const week = monday.toISOString().slice(0, 10);

test.describe('Profile photos', { tag: ['@m3', '@mobile'] }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`each parent sets their own photo and their own photo of a child; desktop calendar circles show them, phones keep initials, ${theme} (#388)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const phone = (page.viewportSize()?.width ?? 1280) < 1024;
      const members = await family.dad.json<{ members: { membershipId: string; displayName: string }[] }>(family.dad.get(`/api/families/${family.familyId}`));
      const dadId = members.members.find((m) => m.displayName === 'Dad')!.membershipId;
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/calendar/events`, {
        category: 'ParentingTime', title: 'Dad time', childIds: [family.kaiId], caregiverMembershipId: dadId,
        startsAt: addHours(monday, 24 + 9).toISOString(), endsAt: addHours(monday, 24 + 17).toISOString(),
      }));

      // Mom picks her own photo of Kai first. Dad must never see it.
      const moms = await family.mom.http.put(`/api/families/${family.familyId}/photos/children/${family.kaiId}`, {
        data: BLUE, headers: { 'Content-Type': 'image/png', 'X-XSRF-TOKEN': (await family.mom.http.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')!.value },
      });
      expect(moms.status()).toBe(200);
      const momsKai = ((await moms.json()) as { url: string }).url;

      await signIn(page, family.dad.email);
      await page.goto('/settings');
      const photos = page.locator('app-profile-photo-settings');
      await expect(page.getByRole('heading', { level: 2, name: 'Profile photos' })).toBeVisible();
      const own = photos.locator('app-photo-editor').first();
      const kai = photos.locator('app-photo-editor').filter({ hasText: 'Kai' });
      await expect(kai.getByText('No photo yet, so the initial K shows.')).toBeVisible();

      await test.step('Dad saves his own photo and his photo of Kai, only in Settings', async () => {
        await pickPhoto(page, own, RED, 'dad.png');
        await pickPhoto(page, kai, GREEN, 'kai.png');
        await fitsPage(page);
        await scan(page, info, `${theme}-profile-photos-settings`);
        await evidence(page, info, `${theme}-profile-photos-settings`);
      });

      const dadsKai = await kai.locator('app-avatar img').getAttribute('src');
      expect(dadsKai).not.toBe(momsKai);

      await test.step('the account corner shows Dad’s photo on every screen size, and has no photo editing', async () => {
        await page.reload();
        const corner = page.getByRole('banner').locator('button.account app-avatar');
        await expect(corner.locator('img')).toBeVisible();
        expect(await shownPhoto(corner)).toMatch(/\/photos\//);
        await page.getByRole('banner').getByRole('button', { name: /account menu/ }).click();
        await expect(page.getByRole('menuitem', { name: /photo/i })).toHaveCount(0);
        await page.keyboard.press('Escape');
      });

      await test.step('calendar circles: Dad’s own photo choices on desktop, first-letter initials on phones', async () => {
        await page.goto(`/?week=${week}`);
        const block = page.locator(phone ? '.agenda .pt' : '.grid .pt', { hasText: 'Dad time' }).first();
        await expect(block).toBeVisible();
        const parent = block.locator('app-avatar[data-kind="parent"]');
        const child = block.locator('app-avatar:not([data-kind="parent"])');
        if (phone) {
          // The photos are on the page but hidden below 1024px.
          await expect(child.locator('img')).toHaveCount(1);
          expect(await shownPhoto(parent)).toBeNull();
          expect(await shownPhoto(child)).toBeNull();
          await expect(parent).toHaveText('D');
          await expect(child).toHaveText('K');
        } else {
          await expect(child.locator('img')).toBeVisible();
          expect(await shownPhoto(parent)).toMatch(/\/photos\//);
          expect(await shownPhoto(child)).toBe(dadsKai);
        }
        await evidence(page, info, `${theme}-profile-photos-calendar`);
      });

      await test.step('Mom still sees only her own photo of Kai, and Dad can’t read hers', async () => {
        const momsView = await family.mom.json<{ photos: { kind: string; id: string; url: string }[] }>(family.mom.get(`/api/families/${family.familyId}/photos`));
        expect(momsView.photos.find((p) => p.kind === 'child' && p.id === family.kaiId)?.url).toBe(momsKai);
        expect((await page.request.get(momsKai)).status()).toBe(404);
      });
    });
  }

  // One theme only: each run of this test uses a child PIN try, and the suite keeps those lean (rate limit).
  test('a child picks their own photo in their Settings, and the picker and PIN screen show it, dark (#388)', async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await family.dad.put(`/api/families/${family.familyId}/children/${family.kaiId}/pin`, { pin: KAI_PIN })).status()).toBe(204);

    // Dad's personal photo of Kai must never reach the shared picker.
    const token = (await family.dad.http.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')!.value;
    expect((await family.dad.http.put(`/api/families/${family.familyId}/photos/children/${family.kaiId}`, {
      data: RED, headers: { 'Content-Type': 'image/png', 'X-XSRF-TOKEN': token },
    })).status()).toBe(200);

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(family.dad.email);
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Is this a shared family device?' })).toBeVisible();
    await activate(page.getByRole('button', { name: 'Yes, set up sharing' }), info);
    await page.getByLabel('Name this device').fill('Kitchen iPad');
    await page.getByLabel('Choose your parent PIN').fill(DAD_PIN);
    await page.getByLabel('Type your parent PIN again').fill(DAD_PIN);
    await activate(page.getByRole('button', { name: 'Set up sharing' }), info);
    await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();

    const kaiTile = page.getByRole('link', { name: /Kai/ });
    expect(await shownPhoto(kaiTile.locator('app-avatar'))).toBeNull();
    await expect(kaiTile.locator('app-avatar')).toHaveText('K');

    await activate(kaiTile, info);
    await page.getByLabel('PIN').fill(KAI_PIN);
    await activate(page.getByRole('button', { name: 'Go' }), info);
    await expect(page).toHaveURL(/\/kid$/);

    await page.goto('/kid/settings');
    const editor = page.locator('app-photo-editor');
    await expect(page.getByRole('heading', { level: 2, name: 'Your picture' })).toBeVisible();
    await pickPhoto(page, editor, GREEN, 'kai.png');
    await fitsPage(page);
    await scan(page, info, 'dark-profile-photos-kid-settings');
    await evidence(page, info, 'dark-profile-photos-kid-settings');

    await activate(page.getByRole('button', { name: 'Switch profile' }), info);
    await expect(page.getByRole('heading', { level: 1, name: 'Who’s using Parenthesis?' })).toBeVisible();
    const tilePhoto = await shownPhoto(page.getByRole('link', { name: /Kai/ }).locator('app-avatar'));
    expect(tilePhoto).toMatch(/^\/api\/device\/photos\//);
    // The picker shows photos on phones too, and Dad's tile keeps his initial while he has no photo.
    await expect(page.getByRole('link', { name: /Dad/ }).locator('app-avatar')).toHaveText('D');
    await evidence(page, info, 'dark-profile-photos-picker');

    await activate(page.getByRole('link', { name: /Kai/ }), info);
    await expect(page.getByRole('heading', { level: 1, name: 'Hi, Kai' })).toBeVisible();
    expect(await shownPhoto(page.locator('main app-avatar'))).toBe(tilePhoto);
    await expect(page.locator('main input[type=file]')).toHaveCount(0);
  });
});
