import { Page, expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #669: the approved warm Child Essentials landing page (Figma 1321:2, 1321:56, 1321:110, 1321:168). Synthetic family
// only: Dad adds Aurora, Mom approves her and saves Kai's clothing, so Dad sees the update dots.

const CATEGORIES = ['School', 'Allergies & Food', 'Routines', 'Clothing & Shoes', 'What Helps', 'Shared Caregivers', 'Emergency Contacts', 'Medical'];
const ART = ['school', 'allergies', 'routines', 'clothing', 'what-helps', 'caregivers', 'emergency', 'medical'];
// The frames' card fills, light then dark.
const FILLS = {
  light: ['rgb(225, 237, 249)', 'rgb(250, 237, 197)', 'rgb(224, 235, 219)', 'rgb(235, 227, 250)', 'rgb(248, 226, 212)', 'rgb(220, 239, 235)', 'rgb(247, 224, 232)', 'rgb(228, 235, 221)'],
  dark: ['rgb(38, 59, 84)', 'rgb(73, 59, 36)', 'rgb(44, 66, 48)', 'rgb(64, 52, 81)', 'rgb(80, 56, 47)', 'rgb(37, 69, 66)', 'rgb(80, 51, 66)', 'rgb(36, 72, 58)'],
};

const columns = async (page: Page) =>
  new Set(await page.locator('.section-tiles > *').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().x)))).size;
const cards = (page: Page) => page.locator('.section-tiles > details > summary, .section-tiles > .medical-tile');

/** Each name sits in the middle of its choice, on both axes. */
async function namesCentered(page: Page) {
  for (const choice of await page.locator('.children button').all()) {
    const button = (await choice.boundingBox())!;
    const name = (await choice.locator('.child-name').boundingBox())!;
    expect(Math.abs(name.x + name.width / 2 - (button.x + button.width / 2))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(name.y + name.height / 2 - (button.y + button.height / 2))).toBeLessThanOrEqual(1.5);
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`Child Essentials lands on warm colored cards with full-color art (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const aurora = await dad.json<{ changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Aurora' }));
    await mom.json(mom.post(`/api/families/${familyId}/approvals/${aurora.changeRequestId}/approve`, {}));
    await mom.json(mom.put(`/api/families/${familyId}/children/${kaiId}/essentials/clothing`, { revision: 0, values: { shoeSize: 'Size 3' } }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await expect(page.getByRole('heading', { level: 2, name: 'Kai’s essentials' })).toBeVisible();

    // Children: the name alone, centered, highlighted when chosen; no avatar or checkmark. Kai has an update.
    const kai = page.getByRole('button', { name: /^Kai/ });
    await expect(kai).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Aurora/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.children app-avatar, .children app-icon')).toHaveCount(0);
    await expect(kai).toContainText('has updates');
    await namesCentered(page);

    // Eight categories in order, in their own colors, each with its full-color illustration loaded sharp.
    await expect(cards(page).locator('.tile-name')).toHaveText(CATEGORIES);
    expect(await cards(page).evaluateAll((items) => items.map((item) => getComputedStyle(item.parentElement!.matches('details') ? item.parentElement! : item).backgroundColor)))
      .toEqual(FILLS[theme]);
    const art = cards(page).locator('.tile-art');
    await expect(art).toHaveCount(8);
    for (const [index, image] of (await art.all()).entries()) {
      await expect(image).toHaveAttribute('src', `art/child-essentials/tiles/${ART[index]}.webp`);
      const drawn = await image.evaluate((img: HTMLImageElement) => ({
        loaded: img.complete && img.naturalWidth > 0, natural: img.naturalWidth, shown: img.getBoundingClientRect().width,
        filter: getComputedStyle(img).filter, opacity: getComputedStyle(img).opacity,
      }));
      expect(drawn.loaded).toBe(true);
      // At least twice the displayed size, so it stays sharp on high-density screens; full color, fully opaque.
      expect(drawn.natural).toBeGreaterThanOrEqual(drawn.shown * 2);
      expect(drawn).toMatchObject({ filter: 'none', opacity: '1' });
    }
    await expect(page.locator('[data-section=clothing] summary')).toContainText('Sizes and clothing notes');
    await expect(page.locator('[data-section=clothing] summary .child-dot')).toBeVisible();

    // Placement: art before the text on desktop, two columns; after the text on phones, one column.
    const school = cards(page).first();
    const artBox = (await school.locator('.tile-art').boundingBox())!;
    const textBox = (await school.locator('.tile-text').boundingBox())!;
    if (info.project.use.isMobile) {
      expect(artBox.x).toBeGreaterThan(textBox.x);
      expect(await columns(page)).toBe(1);
    } else {
      expect(artBox.x).toBeLessThan(textBox.x);
    }
    await fitsPage(page);
    await evidence(page, info, `essentials-landing-${theme}`);
    await scan(page, info, `essentials-landing-${theme}`);

    // Switching child keeps the landing; opening a category and going back returns to its card.
    await activate(page.getByRole('button', { name: /^Aurora/ }), info);
    await expect(page.getByRole('heading', { level: 2, name: 'Aurora’s essentials' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Aurora/ })).toHaveAttribute('aria-pressed', 'true');
    await namesCentered(page);
    await activate(page.getByRole('button', { name: /^Kai/ }), info);
    // Choosing a child redraws the cards for them; wait for Kai's before opening one.
    await expect(page.getByRole('heading', { level: 2, name: 'Kai’s essentials' })).toBeVisible();
    const clothing = page.locator('[data-section=clothing] summary');
    if (info.project.use.hasTouch) await clothing.tap();
    else { await clothing.focus(); await page.keyboard.press('Enter'); }
    await expect(page.getByRole('heading', { level: 2, name: 'Clothing & Shoes' })).toBeFocused();
    await expect(page.locator('.children app-avatar').first()).toBeAttached();
    await activate(page.getByRole('button', { name: 'All of Kai’s essentials' }), info);
    await expect(clothing).toBeFocused();
    await expect(page.locator('[data-section=clothing] summary .child-dot')).toHaveCount(0);

    // The other screen sizes from the issue on desktop: 768 (one column beside the children) and 1920.
    if (!info.project.use.isMobile) {
      // Beside the navigation, two columns need the room of a wide screen; each card stays at most 470px.
      for (const [width, expected] of [[768, 1], [1920, 2]] as const) {
        await page.setViewportSize({ width, height: 900 });
        expect(await columns(page)).toBe(expected);
        const widest = Math.max(...await page.locator('.section-tiles > *').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width)));
        if (expected === 2) expect(widest).toBeLessThanOrEqual(470.5);
        await fitsPage(page);
        await namesCentered(page);
        await evidence(page, info, `essentials-landing-${width}-${theme}`);
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  });
}

test('Child Essentials landing fits long Spanish labels @m5 @mobile @regression', async ({ page, family }, info) => {
  await signIn(page, family.dad.email);
  await page.goto('/settings');
  await page.getByLabel('Display language').selectOption('es-419');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.goto('/child-essentials');
  await expect(page.getByRole('heading', { level: 2, name: 'Información esencial de Kai' })).toBeVisible();
  await expect(page.locator('[data-section=clothing] summary')).toContainText('Tallas y notas sobre la ropa');
  await expect(page.locator('[data-section=caregivers] summary')).toContainText('Cuidadores, personas de apoyo y recogida en la escuela');
  // Every card's text stays inside its card.
  for (const card of await cards(page).all()) {
    const box = (await card.boundingBox())!;
    const text = (await card.locator('.tile-text').boundingBox())!;
    expect(text.y + text.height).toBeLessThanOrEqual(box.y + box.height + 1);
  }
  await fitsPage(page);
  await evidence(page, info, 'essentials-landing-spanish');
  await page.goto('/settings');
  await page.getByLabel('Idioma de la aplicación').selectOption('en');
});

for (const theme of ['light', 'dark'] as const) {
  test(`an open section has no outline and stays open for the child chosen next (${theme}) #679 #680 @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const aurora = await dad.json<{ changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Aurora' }));
    await mom.json(mom.post(`/api/families/${familyId}/approvals/${aurora.changeRequestId}/approve`, {}));
    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await expect(page.getByRole('heading', { level: 2, name: 'Kai’s essentials' })).toBeVisible();

    for (const section of ['school', 'caregivers', 'emergencyContacts']) {
      await activate(page.locator(`[data-section=${section}] > summary`), info);
      const open = page.locator(`[data-section=${section}][open]`);
      await expect(open).toBeVisible();
      // #679: the category card's outline doesn't wrap the open section.
      expect(await open.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
      await activate(page.getByRole('button', { name: 'All of Kai’s essentials' }), info);
    }

    // #679: not even for the moment between the tile opening and the page marking the section open.
    expect(await page.locator('[data-section=school]').evaluate((el: HTMLDetailsElement) => {
      el.open = true;
      return getComputedStyle(el).borderTopWidth;
    })).toBe('0px');
    await activate(page.getByRole('button', { name: 'All of Kai’s essentials' }), info);

    // #680: beside the open section (desktop), choosing Aurora shows Aurora's same section.
    await activate(page.locator('[data-section=caregivers] > summary'), info);
    await expect(page.getByRole('heading', { level: 2, name: 'Shared Caregivers' })).toBeFocused();
    if (!info.project.use.isMobile) {
      await activate(page.getByRole('button', { name: /^Aurora/ }), info);
      await expect(page.getByRole('button', { name: /^Aurora/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('heading', { level: 2, name: 'Shared Caregivers' })).toBeFocused();
      await expect(page.getByRole('button', { name: 'All of Aurora’s essentials' })).toBeVisible();
      await expect(page.locator('details[open]')).toHaveCount(1);
      await activate(page.getByRole('button', { name: 'All of Aurora’s essentials' }), info);
      await expect(page.getByRole('heading', { level: 2, name: 'Aurora’s essentials' })).toBeVisible();
      await expect(page.locator('[data-section=caregivers] > summary')).toBeFocused();
    }
    await fitsPage(page);
  });
}
