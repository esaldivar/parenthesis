import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #659: the approved Child Essentials Medical redesign (Figma page 174:2). Synthetic family only: Mom saves a provider
// through the API as her own device would; Dad works on Medical in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`Medical providers and medication work in the approved layout (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const medical = `/api/families/${familyId}/children/${kaiId}/essentials/medical`;
    await mom.json(mom.post(medical, {
      provider: {
        id: crypto.randomUUID(), type: 'Doctor', name: 'Dr. Synthetic Reed', specialty: null, practice: 'Example Clinic',
        phone: '5125550142', address: '120 Example Lane',
      },
      childIds: [kaiId],
    }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.getByRole('button', { name: /^Medical/ }), info);
    const providers = page.locator('app-medical-providers-section');
    await expect(page.getByRole('heading', { level: 2, name: 'Medical' })).toBeVisible();
    await expect(providers.getByRole('button', { name: 'All of Kai’s essentials' })).toBeFocused();

    // Mom's provider: "Updated" as plain text beside the type, the U.S. number formatted, Call with its phone icon.
    const card = providers.locator('article.provider').first();
    await expect(card.locator('.type')).toHaveText('Doctor, Updated');
    await expect(card).toContainText('(512) 555-0142');
    await expect(card.getByRole('link', { name: 'Call Dr. Synthetic Reed' })).toHaveAttribute('href', 'tel:5125550142');
    await expect(card.getByRole('link', { name: /^Directions to Dr. Synthetic Reed/ })).toHaveAttribute('target', '_blank');
    // The chosen child is shown by the highlighted row alone (hidden on phones), still exposed as pressed.
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await fitsPage(page);
    await scan(page, info, `medical-${theme}`);
    await evidence(page, info, `medical-${theme}`);

    // Add a second provider: the form's required contact fields, then Save, reachable above the phone's navigation.
    await activate(providers.getByRole('button', { name: 'Add provider' }), info);
    await expect(page.getByRole('heading', { level: 2, name: 'Add provider' })).toBeFocused();
    await providers.getByLabel('Provider type').selectOption('Dentist');
    await providers.getByLabel('Provider name').fill('Example Dental');
    await providers.getByLabel('Phone number (required)').fill('+44 20 7946 0958');
    await providers.getByLabel('Practice address (required)').fill('1 Sample Road');
    const save = providers.getByRole('button', { name: 'Save provider' });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await fitsPage(page);
    await evidence(page, info, `medical-add-provider-${theme}`);
    await activate(save, info);
    await expect(providers.getByRole('status')).toHaveText('Medical providers saved.');
    const dental = providers.locator('article.provider', { hasText: 'Example Dental' });
    await expect(dental).toContainText('+44 20 7946 0958');

    // Edit, then remove with its own confirmation step.
    await activate(dental.getByRole('button', { name: 'Edit Example Dental' }), info);
    await expect(page.getByRole('heading', { level: 2, name: 'Edit provider' })).toBeVisible();
    await providers.getByLabel('Practice name (optional)').fill('Sample Smiles');
    await activate(providers.getByRole('button', { name: 'Save provider' }), info);
    await expect(dental).toContainText('Sample Smiles');
    await activate(dental.getByRole('button', { name: 'Remove Example Dental' }), info);
    await expect(page.getByRole('heading', { level: 2, name: 'Remove provider' })).toBeVisible();
    await expect(providers).toContainText('Remove Example Dental from this child’s medical providers?');
    await fitsPage(page);
    await evidence(page, info, `medical-remove-provider-${theme}`);
    await activate(providers.getByRole('button', { name: 'Confirm removal' }), info);
    await expect(providers.locator('article.provider')).toHaveCount(1);

    // History lists each save with its author and the formatted provider lines.
    await activate(providers.getByRole('button', { name: 'History' }), info);
    const history = providers.locator('#medical-history');
    await expect(history.getByRole('heading', { name: 'Medical provider history' })).toBeVisible();
    await expect(history.locator('article').first()).toContainText('Dad');
    await expect(history).toContainText('Dr. Synthetic Reed · Doctor · Example Clinic · (512) 555-0142 · 120 Example Lane');
    await fitsPage(page);
    await evidence(page, info, `medical-provider-history-${theme}`);

    // Medication: the empty state, the first-change notice, then add and edit with real data.
    const medication = page.locator('app-medication-section');
    await expect(medication).toContainText('No current medications.');
    await activate(medication.getByRole('button', { name: 'Add medication' }), info);
    await medication.getByLabel('Medication name').fill('Sample tablet');
    await medication.getByLabel('Schedule (optional)').fill('Daily');
    const saveMedication = medication.getByRole('button', { name: 'Save medication' });
    await expect(saveMedication).toBeDisabled();
    await medication.getByLabel('I understand').check();
    await saveMedication.scrollIntoViewIfNeeded();
    await expect(saveMedication).toBeInViewport();
    await fitsPage(page);
    await evidence(page, info, `medical-add-medication-${theme}`);
    await activate(saveMedication, info);
    await expect(medication.getByRole('status').first()).toHaveText('Medication saved.');
    const record = medication.locator('article.medication', { hasText: 'Sample tablet' });
    await expect(record).toContainText('Schedule');
    await activate(record.getByRole('button', { name: 'Edit Sample tablet' }), info);
    await medication.getByLabel('Instructions (optional)').fill('With food');
    await activate(medication.getByRole('button', { name: 'Save medication' }), info);
    await expect(record).toContainText('With food');
    await fitsPage(page);
    await evidence(page, info, `medical-medication-${theme}`);

    // The combined PDF downloads for the chosen child.
    await activate(medication.getByRole('button', { name: 'Download medication PDF' }), info);
    const download = page.waitForEvent('download');
    await activate(medication.getByRole('button', { name: 'Download PDF' }), info);
    expect((await download).suggestedFilename()).toMatch(/^medications-\d{4}-\d{2}-\d{2}\.pdf$/);
    await expect(medication.getByRole('status').filter({ hasText: 'PDF' })).toHaveText('Medication PDF downloaded.');

    // Back to all of Kai's essentials, with focus on the Medical tile.
    await activate(providers.getByRole('button', { name: 'All of Kai’s essentials' }), info);
    await expect(page.getByRole('button', { name: /^Medical/ })).toBeFocused();
  });
}
