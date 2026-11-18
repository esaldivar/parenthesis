import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #666: the approved Routines redesign (Figma page 811:194): folder tabs on one panel. Synthetic family only.

for (const theme of ['light', 'dark'] as const) {
  test(`Routines uses folder tabs, shares a co-parent's list and adds for chosen children (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const add = `/api/families/${familyId}/essentials/routines`;
    expect((await mom.post(add, { routine: { title: 'Brushing teeth', details: 'Two minutes, morning and night' }, childIds: [kaiId], visibility: 'shared' })).ok()).toBe(true);
    expect((await mom.post(add, { routine: { title: 'Lights out', details: 'Story first' }, childIds: [kaiId], visibility: 'mine' })).ok()).toBe(true);

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await page.getByRole('button', { name: /^Kai/ }).first().click();
    await activate(page.locator('[data-section=routines] > summary'), info);
    const section = page.locator('app-routines-section');
    const tab = (name: RegExp) => section.locator('.tab').filter({ hasText: name });

    // Shared is chosen: one panel, the routine as a subcard with its title and details.
    await expect(tab(/^Shared$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(section.locator('.panel .row').first()).toContainText('Brushing teeth');
    await expect(section.locator('.panel .row').first()).toContainText('Two minutes, morning and night');
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await fitsPage(page);
    await evidence(page, info, `routines-shared-${theme}`);
    await scan(page, info, `routines-shared-${theme}`);

    // Mom's tab: her list, which Dad can use in both homes; it then shows under Shared as agreed.
    await activate(tab(/Mom/), info);
    await expect(tab(/Mom/)).toHaveAttribute('aria-pressed', 'true');
    await expect(section.locator('.panel')).toContainText('Lights out');
    await fitsPage(page);
    await evidence(page, info, `routines-other-parent-${theme}`);
    await activate(section.getByRole('button', { name: /Use in both homes/ }), info);
    await activate(tab(/^Shared$/), info);
    await expect(section.locator('.panel')).toContainText('Lights out');
    await evidence(page, info, `routines-agreed-${theme}`);
    await activate(section.getByRole('button', { name: /Stop sharing/ }).first(), info);
    await expect(section.locator('.panel')).toContainText('These routines are no longer shared.');
    await activate(tab(/^Shared$/), info);
    await expect(section.locator('.panel')).not.toContainText('Lights out');

    // Add: blank, no child chosen, Save off until both a title and a child are given.
    await activate(section.getByRole('button', { name: 'Add routine' }), info);
    const save = section.getByRole('button', { name: 'Save routine' });
    await expect(save).toBeDisabled();
    await section.getByRole('textbox', { name: 'Routine', exact: true }).fill('Getting ready for school');
    await expect(save).toBeDisabled();
    await section.locator('.child-picker input[type=checkbox]').first().check();
    await fitsPage(page);
    await evidence(page, info, `routines-add-${theme}`);
    await activate(save, info);
    await expect(section.locator('.panel .row').filter({ hasText: 'Getting ready for school' })).toBeVisible();
  });
}
