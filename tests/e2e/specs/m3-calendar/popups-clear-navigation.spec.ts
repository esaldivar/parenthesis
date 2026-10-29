import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { test, activate, evidence, signIn } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';

// #327: nonmodal popups never cover or intercept the phone layout's bottom navigation. Synthetic family only.
const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);

/** The bottom navigation's top edge, or the viewport's bottom when there is none (desktop). */
async function floor(page: Page) {
  const nav = page.locator('nav.bottomnav');
  const box = (await nav.isVisible()) ? await nav.boundingBox() : null;
  return box ? box.y : page.viewportSize()!.height;
}

/** The popup and every date cell sit entirely between the top of the screen and the navigation. */
async function clearOfNavigation(page: Page, popup: Locator, cells: Locator) {
  const bottom = await floor(page);
  const box = (await popup.boundingBox())!;
  expect(box.y, 'popup starts on screen').toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, 'popup ends above the bottom navigation').toBeLessThanOrEqual(bottom + 1);
  for (const cell of await cells.all()) {
    const c = (await cell.boundingBox())!;
    expect(c.y + c.height, `${await cell.getAttribute('aria-label')} is above the navigation`).toBeLessThanOrEqual(bottom + 1);
  }
}

/**
 * The date field where the owner saw the picker cover the navigation: low enough that the picker only fits below it
 * by overlapping the navigation, but would fit below it on the whole screen. Measures the picker first, then scrolls
 * the field so the space below it is the picker's height plus 10px.
 */
async function lowDateField(page: Page, info: TestInfo) {
  await page.getByRole('button', { name: /Activity/ }).click();
  const end = page.locator('#add-end-date');
  await end.scrollIntoViewIfNeeded();
  const popup = await openPicker(page, end, info);
  const height = (await popup.boundingBox())!.height;
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  // Moving the page by (wanted - current) leaves exactly the picker's height plus 10px below the field.
  await end.evaluate((el, h) => window.scrollBy(0, h + 10 - (window.innerHeight - el.getBoundingClientRect().bottom)), height);
  const below = await end.evaluate(el => window.innerHeight - el.getBoundingClientRect().bottom);
  // The scenario only means something when the picker would fit on the screen but not above the navigation.
  const nav = await page.locator('nav.bottomnav').boundingBox();
  if (nav) {
    expect(below, 'room below the field for the picker on the whole screen').toBeGreaterThanOrEqual(height);
    expect(below - (page.viewportSize()!.height - nav.y), 'but not above the navigation').toBeLessThan(height);
  }
  return end;
}

async function openPicker(page: Page, field: Locator, info: TestInfo) {
  await activate(field, info);
  const popup = page.locator('mat-datepicker-content');
  await expect(popup).toBeVisible();
  // Wait for the opening animation, so geometry is measured where the picker settles.
  await expect.poll(async () => popup.evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  return popup;
}

test.describe('Nonmodal popups clear the bottom navigation', { tag: ['@m3', '@mobile'] }, () => {
  test.setTimeout(90_000);

  for (const theme of ['light', 'dark'] as const) {
    test(`a low date picker opens above the navigation, every date works, and one tap navigates, ${theme} (#327)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const touch = !!info.project.use.hasTouch;
      // A short phone screen leaves the least room above the navigation.
      if (touch) await page.setViewportSize({ width: page.viewportSize()!.width, height: 600 });
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${date}`);
      const end = await lowDateField(page, info);

      const popup = await openPicker(page, end, info);
      const cells = page.locator('mat-calendar .mat-calendar-body-cell');
      await clearOfNavigation(page, popup, cells);
      await evidence(page, info, `${theme}-low-picker-clear`);

      // It stays clear when the screen changes size while it's open (rotation, browser bars, keyboard).
      if (touch) {
        await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
        await expect.poll(async () => {
          const box = (await popup.boundingBox())!;
          return box.y + box.height <= (await floor(page)) + 1;
        }).toBe(true);
      }

      // Every date can still be chosen.
      const last = cells.last();
      const label = await last.getAttribute('aria-label');
      await activate(last, info);
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      expect(label).toBeTruthy();

      if (touch) {
        // One tap on the navigation closes the open picker and navigates; the picker doesn't swallow the tap.
        await openPicker(page, end, info);
        await page.locator('nav.bottomnav').getByRole('link', { name: 'Calendar', exact: true }).tap();
        await expect(page).toHaveURL(/\/calendar(\?|$)/);
        await expect(page.locator('mat-datepicker-content')).toHaveCount(0);
      }
    });
  }

  test('with 200% text, a low date picker still keeps its dates above the navigation (#327)', async ({ page, family }, info) => {
    await signIn(page, family.dad.email);
    await page.goto(`/calendar/new?date=${date}`);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const end = await lowDateField(page, info);
    const popup = await openPicker(page, end, info);
    await clearOfNavigation(page, popup, page.locator('mat-calendar .mat-calendar-body-cell'));
    await evidence(page, info, 'text-enlarged-low-picker-clear');
  });

  test('a dropdown near the navigation opens above it (#327)', async ({ page, family }, info) => {
    await signIn(page, family.dad.email);
    await page.goto(`/calendar/new?date=${date}`);
    await page.getByRole('button', { name: /Activity/ }).click();
    const repeat = page.getByRole('combobox', { name: 'How often' });
    await repeat.evaluate(el => el.scrollIntoView({ block: 'end' }));
    await activate(repeat, info);
    const panel = page.getByRole('listbox');
    await expect(panel).toBeVisible();
    await clearOfNavigation(page, panel, panel.getByRole('option'));
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(repeat).toBeFocused();
  });
});
