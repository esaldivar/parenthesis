import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #128 and docs/design/child-essentials-handoff.md ("Updates in Child Essentials"). Synthetic family only: Mom saves
// Kai's shoe size through the API, as her own device would; Dad sees the in-page indicators in the browser.

interface Updates {
  newUpdates: boolean;
  sections: { childId: string; section: string; unopened: boolean; rows: string[] }[];
}

for (const theme of ['light', 'dark'] as const) {
  test(`the other parent sees a shared Child Essentials update, and each indicator clears on its own (${theme}) @m4 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const updates = `/api/families/${familyId}/essentials/updates`;
    await mom.json(mom.put(`/api/families/${familyId}/children/${kaiId}/essentials/clothing`, {
      revision: 0, values: { shoeSize: 'Size 3' },
    }));
    await mom.json(mom.put(`/api/families/${familyId}/children/${kaiId}/essentials/clothing`, {
      revision: 1, values: { shoeSize: 'Size 4' },
    }));
    // Mom saved it, so she has nothing to see.
    expect((await mom.json<Updates>(mom.get(updates))).newUpdates).toBe(false);

    await signIn(page, dad.email);
    const desktop = page.viewportSize()!.width >= 1024;

    // 1. A dot by Child Essentials (under More on phones), with words for screen readers.
    if (desktop) {
      const link = page.locator('nav.sidenav').getByRole('link', { name: /Child Essentials.*updated by your co-parent/ });
      await expect(link).toBeVisible();
      await activate(link, info);
    } else {
      await activate(page.locator('nav.bottomnav').getByRole('link', { name: /More.*Child Essentials updated/ }), info);
      await activate(page.getByRole('link', { name: /Child Essentials.*updated by your co-parent/ }), info);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Child Essentials' })).toBeVisible();

    // 2. Both saves make one banner, naming the child and the one field that changed, never its value; the nav dot
    // is gone.
    const banner = page.locator('.banner');
    await expect(banner).toHaveText('Kai’s shoe size updated');
    await expect(banner).not.toContainText('Size 4');
    await expect(banner).toHaveCount(1);
    await expect(page.getByRole('link', { name: /updated by your co-parent|Child Essentials updated/ })).toHaveCount(0);
    await expect.poll(async () => (await dad.json<Updates>(dad.get(updates))).newUpdates).toBe(false);

    // 3. Clothing's dot and the changed row's highlight show; the unchanged row doesn't.
    const clothing = page.locator('app-clothing-section');
    const tile = page.locator('[data-section=clothing] > summary');
    await expect(tile).toContainText('updated');
    await expect(clothing.locator('section')).not.toBeVisible();
    await activate(tile, info);
    await expect(tile).not.toContainText('updated');
    const shoes = clothing.locator('.row').filter({ hasText: 'Shoe size' });
    await expect(shoes).toHaveClass(/row--updated/);
    await expect(shoes).toContainText('Updated');
    await expect(clothing.locator('.row').filter({ hasText: 'Top size' })).not.toHaveClass(/row--updated/);
    await fitsPage(page);
    await evidence(page, info, `${theme}-essentials-update`);
    await scan(page, info, `${theme}-essentials-update`);

    // 4. X dismisses the banner, and focus goes to the heading; the section dot and row highlight stay.
    await activate(page.getByRole('button', { name: 'Dismiss: Kai’s shoe size updated' }), info);
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(shoes).toHaveClass(/row--updated/);

    // Having been on screen, the section and the row are seen: the next visit shows neither, and no banner.
    await expect.poll(async () => (await dad.json<Updates>(dad.get(updates))).sections).toEqual([]);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Child Essentials' })).toBeVisible();
    await expect(clothing.locator('.row').filter({ hasText: 'Shoe size' })).toContainText('Size 4');
    await expect(page.locator('.banner')).toHaveCount(0);
    await expect(page.locator('.row--updated')).toHaveCount(0);
    await expect(page.locator('.updated-badge')).toHaveCount(0);

    // The change stays in history, with no need to acknowledge it.
    await activate(tile, info);
    await activate(clothing.getByRole('button', { name: 'History' }), info);
    await expect(clothing.locator('#clothing-history article')).toHaveCount(2);
    await expect(clothing.locator('#clothing-history article').first()).toContainText('Mom');
  });
}

test('the co-parent’s Routines tab shows a dot until opened, and a changed caregiver is highlighted @m4 @mobile @regression', async ({ page, family }, info) => {
  const { dad, mom, familyId, kaiId } = family;
  const child = `/api/families/${familyId}/children/${kaiId}/essentials`;
  const homes = await mom.json<{ ownerId: string; isMine: boolean }[]>(mom.get(`${child}/routines/households`));
  const momsId = homes.find((home) => home.isMine)!.ownerId;
  await mom.json(mom.post(`/api/families/${familyId}/essentials/routines`, {
    routine: { title: 'Lights out', details: '8:30 PM' }, childIds: [kaiId], visibility: 'mine',
  }));
  expect((await mom.post(`${child}/caregivers`, { version: 0, details: { name: 'Ava Park', phone: '555-010-4000', schoolPickup: true } })).status()).toBe(204);

  await signIn(page, dad.email);
  await page.goto('/child-essentials');
  await expect(page.locator('.banner')).toHaveText(['Kai’s routines at your co-parent’s home updated', 'Kai’s Shared Caregivers updated']);

  const routines = page.locator('app-routines-section');
  const routinesTile = page.locator('[data-section=routines] > summary');
  await activate(routinesTile, info);
  const momsTab = routines.getByRole('button', { name: /Mom’s routines.*updated/ });
  await momsTab.scrollIntoViewIfNeeded();
  await expect(momsTab).toBeVisible();
  await activate(momsTab, info);
  await expect(routines.getByRole('button', { name: 'Mom’s routines', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(routines.locator('.row').filter({ hasText: 'Lights out' })).toHaveClass(/row--updated/);

  if (page.viewportSize()!.width >= 1024) {
    await expect(page.locator('.layout')).toHaveClass(/focused/);
    await expect(page.locator('.children')).toBeVisible();
    await expect(page.locator('#essentials-heading')).not.toBeVisible();
  }
  await activate(page.getByRole('button', { name: 'All of Kai’s essentials' }), info);
  await expect(routinesTile).toBeFocused();

  await activate(page.locator('[data-section=caregivers] > summary'), info);
  const ava = page.locator('app-caregivers-section article').filter({ hasText: 'Ava Park' });
  await ava.scrollIntoViewIfNeeded();
  await expect(ava).toHaveClass(/row--updated/);
  await expect(ava.locator('h4')).toContainText('Updated');
  await fitsPage(page);
  await scan(page, info, 'routines-caregiver-update');

  // Opened and seen: the next visit shows none of it.
  await expect.poll(async () => (await dad.json<Updates>(dad.get(`/api/families/${familyId}/essentials/updates`))).sections).toEqual([]);
  await page.reload();
  await activate(routinesTile, info);
  await expect(routines.getByRole('button', { name: 'Mom’s routines', exact: true })).toBeVisible();
  await expect(page.locator('.row--updated')).toHaveCount(0);
});
