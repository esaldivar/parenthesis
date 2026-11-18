import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #664: the approved Shared Caregivers redesign (Figma page 626:194). Synthetic family only: Mom adds a caregiver
// through the API as her own device would; Dad works in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`Shared Caregivers adds role and notes in the sheet, recovers from failure and confirms removal (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const caregivers = `/api/families/${familyId}/children/${kaiId}/essentials/caregivers`;
    expect((await mom.post(caregivers, { version: 0, details: { name: 'Riley Moreno', phone: '5125550101', hourlyRate: 20, role: 'Sitter' } })).status()).toBe(204);

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.locator('[data-section=caregivers] > summary'), info);
    const section = page.locator('app-caregivers-section');
    await expect(page.getByRole('heading', { level: 2, name: 'Shared Caregivers' })).toBeVisible();

    // The card: bold name and stars, record-level Updated beside them, rate and missing city, 3-3-4 phone, Call.
    const card = section.locator('.card').first();
    await expect(card.locator('.caregiver-name')).toHaveText('Riley Moreno');
    await expect(card.locator('.updated')).toHaveText('· Updated');
    await expect(card).toContainText('Hourly rate: $20.00/hour');
    await expect(card).toContainText('City: Not provided');
    await expect(card.locator('.phone')).toHaveText('512-555-0101');
    await expect(card.getByRole('link', { name: 'Call Riley Moreno' })).toHaveAttribute('href', 'tel:5125550101');
    await expect(card.locator('.call app-icon')).toBeVisible();
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await fitsPage(page);
    await evidence(page, info, `caregivers-main-${theme}`);
    await scan(page, info, `caregivers-main-${theme}`);

    // Add in the sheet: Save with nothing filled in explains what's missing.
    await activate(section.getByRole('button', { name: 'Add caregiver' }), info);
    const sheet = page.getByRole('dialog', { name: 'Add caregiver' });
    await expect(sheet).toBeVisible();
    await activate(sheet.getByRole('button', { name: 'Save' }), info);
    await expect(sheet.getByRole('alert')).toHaveText('Enter a name and a valid phone number.');
    await evidence(page, info, `caregivers-validation-${theme}`);
    await sheet.getByRole('textbox', { name: 'Name' }).fill('Jordan Lee');
    await sheet.getByRole('textbox', { name: 'Role' }).fill('Family friend');
    await sheet.getByRole('textbox', { name: 'Phone' }).fill('214-555-0177');
    await sheet.getByRole('textbox', { name: 'Notes' }).fill('Can do school pickup on Fridays.');

    // A failed save keeps the draft and offers Retry, which saves it.
    await page.route(caregivers, (route) => route.request().method() === 'POST' ? route.fulfill({ status: 500 }) : route.fallback());
    await activate(sheet.getByRole('button', { name: 'Save' }), info);
    await expect(sheet.getByRole('alert')).toHaveText('The caregiver update couldn’t be saved.');
    await expect(sheet.getByRole('textbox', { name: 'Role' })).toHaveValue('Family friend');
    await evidence(page, info, `caregivers-save-failure-${theme}`);
    await page.unroute(caregivers);
    await activate(sheet.getByRole('button', { name: 'Retry' }), info);
    await expect(sheet).toBeHidden();
    await expect(section.getByRole('status')).toHaveText('Shared caregivers updated.');
    const jordan = section.locator('.card').filter({ hasText: 'Jordan Lee' });
    await expect(jordan).toContainText('Family friend');
    await expect(jordan).toContainText('Can do school pickup on Fridays.');

    // Edit starts from the saved values; Cancel with changes asks before discarding them.
    await activate(jordan.getByRole('button', { name: 'Edit' }), info);
    const edit = page.getByRole('dialog', { name: 'Edit caregiver' });
    await expect(edit.getByRole('textbox', { name: 'Role' })).toHaveValue('Family friend');
    await edit.getByRole('textbox', { name: 'City' }).fill('Austin');
    await activate(edit.getByRole('button', { name: 'Cancel' }), info);
    await expect(edit.getByRole('alert').last()).toHaveText('Discard your unsaved changes?');
    await evidence(page, info, `caregivers-unsaved-${theme}`);
    await activate(edit.getByRole('button', { name: 'Cancel' }), info);
    await expect(edit).toBeHidden();
    await expect(jordan).toContainText('City: Not provided');

    // Removal is confirmed in the sheet.
    await activate(jordan.getByRole('button', { name: 'Remove' }), info);
    const remove = page.getByRole('dialog', { name: 'Remove caregiver' });
    await expect(remove).toContainText('Jordan Lee');
    await fitsPage(page);
    await evidence(page, info, `caregivers-remove-${theme}`);
    await activate(remove.getByRole('button', { name: 'Confirm removal' }), info);
    await expect(remove).toBeHidden();
    await expect(section.locator('.card').filter({ hasText: 'Jordan Lee' })).toHaveCount(0);
    const saved = await dad.json<{ caregivers: { details: { name: string; role: string | null } }[] }>(dad.get(caregivers));
    expect(saved.caregivers.map((item) => item.details.name)).toEqual(['Riley Moreno']);
    expect(saved.caregivers[0]?.details.role).toBe('Sitter');
  });
}
