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
    await clothing.scrollIntoViewIfNeeded();
    await expect(clothing.locator('.updated-badge')).toHaveText('Updated');
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
    await activate(clothing.getByRole('button', { name: 'History' }), info);
    await expect(clothing.locator('#clothing-history article')).toHaveCount(2);
    await expect(clothing.locator('#clothing-history article').first()).toContainText('Mom');
  });
}
