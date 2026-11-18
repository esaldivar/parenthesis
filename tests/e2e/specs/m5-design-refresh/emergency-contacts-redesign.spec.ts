import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #665: the approved Emergency Contacts redesign (Figma page 715:194). Synthetic family only.

for (const theme of ['light', 'dark'] as const) {
  test(`Emergency Contacts copies with confirmation, warns on a duplicate number and confirms removal (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const lia = await dad.json<{ id: string; changeRequestId: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Lia' }));
    await mom.json(mom.post(`/api/families/${familyId}/approvals/${lia.changeRequestId}/approve`, {}));
    const contacts = `/api/families/${familyId}/children/${kaiId}/essentials/emergency-contacts`;
    await mom.json(mom.put(contacts, { version: 0, contacts: [
      { name: 'Morgan Lee', relationship: 'Aunt', phone: '5125550101', address: '1 Sample Way, Austin', callFirst: true },
      { name: 'Riley Park', relationship: 'Neighbor', phone: '5125550102', address: null, callFirst: false },
    ] }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await page.getByRole('button', { name: /^Kai/ }).first().click();
    await activate(page.locator('[data-section=emergencyContacts] > summary'), info);
    const section = page.locator('app-emergency-contacts-section');
    await expect(page.getByRole('heading', { level: 2, name: 'Emergency Contacts' })).toBeVisible();

    // Cards: Call first pinned, 3-3-4 phone, Call before Maps (only with an address), compact centered Add.
    const morgan = section.locator('.card').first();
    await expect(morgan).toContainText('Call first');
    await expect(morgan).toContainText('Aunt · 512-555-0101');
    await expect(morgan.getByRole('link', { name: 'Call Morgan Lee' })).toHaveAttribute('href', 'tel:5125550101');
    await expect(morgan.getByRole('link', { name: 'Open in Maps' })).toBeVisible();
    await expect(section.locator('.card').nth(1).getByRole('link', { name: 'Open in Maps' })).toHaveCount(0);
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await fitsPage(page);
    await evidence(page, info, `emergency-main-${theme}`);
    await scan(page, info, `emergency-main-${theme}`);

    // Copy to Lia with confirmation; Lia's Call first stays hers; copying again adds nothing.
    await activate(morgan.getByRole('button', { name: 'Copy Morgan Lee' }), info);
    await expect(section.locator('.state')).toContainText('Lia’s Call first selection stays separate from Kai’s.');
    await evidence(page, info, `emergency-copy-${theme}`);
    await activate(section.getByRole('button', { name: 'Copy contact' }), info);
    await expect(section.getByRole('status')).toHaveText('Emergency contact copied.');
    await activate(section.locator('.card').first().getByRole('button', { name: 'Copy Morgan Lee' }), info);
    await activate(section.getByRole('button', { name: 'Copy contact' }), info);
    const liaList = await dad.json<{ contacts: { name: string; callFirst: boolean }[] }>(dad.get(contacts.replace(kaiId, lia.id)));
    expect(liaList.contacts).toEqual([expect.objectContaining({ name: 'Morgan Lee', callFirst: false })]);

    // A different person with the same number: the warning and Review contact.
    await activate(section.getByRole('button', { name: 'Add emergency contact' }), info);
    const form = section.locator('form');
    await form.getByRole('textbox', { name: 'Name' }).fill('Avery Lee');
    await form.getByRole('combobox', { name: 'Relationship' }).selectOption('Sibling');
    await form.getByRole('textbox', { name: 'Phone' }).fill('(512) 555-0102');
    await expect(form.getByRole('checkbox', { name: 'Call first contact for Kai' })).toHaveAccessibleDescription(
      'When set, this contact is pinned above other emergency contacts for Kai.');
    await activate(form.getByRole('button', { name: 'Save' }), info);
    await expect(form.getByRole('alert')).toContainText('This phone number is already on Kai’s emergency contact list.');
    await fitsPage(page);
    await evidence(page, info, `emergency-duplicate-${theme}`);
    await activate(form.getByRole('button', { name: 'Review contact' }), info);
    await expect(section.locator('#contact-1')).toBeFocused();

    // Removal is confirmed in the panel.
    await activate(section.locator('.card').nth(1).getByRole('button', { name: 'Remove' }), info);
    await expect(section.locator('.state')).toContainText('Remove Riley Park from Kai’s emergency contacts?');
    await evidence(page, info, `emergency-remove-${theme}`);
    await activate(section.getByRole('button', { name: 'Remove contact' }), info);
    await expect(section.locator('.card')).toHaveCount(1);
  });
}
