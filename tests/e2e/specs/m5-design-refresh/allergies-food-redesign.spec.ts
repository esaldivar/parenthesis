import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #662: the approved Child Essentials Allergies & Food redesign (Figma page 331:2) and its branded allergy PDF.
// Synthetic family only: Mom saves through the API as her own device would; Dad works in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`Allergies & Food keeps no-known and unrecorded apart, the draft on failure and on a co-parent conflict (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const allergies = `/api/families/${familyId}/children/${kaiId}/essentials/allergies-food`;

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.locator('[data-section=allergiesFood] > summary'), info);
    const section = page.locator('app-allergies-food-section');
    await expect(page.getByRole('heading', { level: 2, name: 'Allergies & Food' })).toBeVisible();
    const row = (label: string) => section.locator('section > .panel .row').filter({ has: page.locator('.label', { hasText: label }) });

    // Nothing recorded reads "No allergies listed", never "No known allergies".
    await expect(row('Allergies and notes').locator('dd')).toHaveText('No allergies listed');
    await expect(row('Dietary restrictions and food preferences').locator('dd')).toHaveText('Not set');

    // Mom asserts No known allergies: it reads differently, and Updated sits by the label as plain text.
    const first = await mom.json<{ revision: number }>(mom.get(allergies));
    await mom.json(mom.put(allergies, { revision: first.revision, values: { allergies: null, noKnownAllergies: true, foodPreferences: 'Prefers mild meals' } }));
    await page.reload();
    await activate(page.locator('[data-section=allergiesFood] > summary'), info);
    await expect(row('Allergies and notes').locator('dd')).toHaveText('No known allergies');
    await expect(row('Allergies and notes').locator('.updated')).toHaveText('Updated');
    await expect(section.locator('section > .panel dt .label')).toHaveText(['Allergies and notes', 'Dietary restrictions and food preferences']);
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await expect(page.locator('.children button[aria-pressed=true]')).toHaveCount(1);
    await fitsPage(page);
    await evidence(page, info, `allergies-detail-${theme}`);
    await scan(page, info, `allergies-detail-${theme}`);

    // PDF options: the child choice and a full-width Download PDF; the file keeps the server's dated name.
    await activate(section.getByRole('button', { name: 'Download allergy PDF' }), info);
    await expect(section.getByLabel('Include in the allergy PDF')).toHaveValue(kaiId);
    await fitsPage(page);
    await evidence(page, info, `allergies-pdf-options-${theme}`);
    const download = page.waitForEvent('download');
    await activate(section.getByRole('button', { name: 'Download PDF' }), info);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^allergies-\d{4}-\d{2}-\d{2}\.pdf$/);
    await file.saveAs(info.outputPath(`allergy-reference-${theme}.pdf`));
    await expect(section.locator('#allergy-pdf-options [role=status]')).not.toBeEmpty();

    // Edit starts with the saved status; the real checkbox is described by the reconciliation hint.
    await activate(section.getByRole('button', { name: 'Edit Allergies & Food' }), info);
    const none = section.getByRole('checkbox', { name: 'No known allergies' });
    await expect(none).toBeChecked();
    await expect(none).toHaveAccessibleDescription('Entering an allergy replaces the No known allergies status.');
    await fitsPage(page);
    await evidence(page, info, `allergies-edit-no-known-${theme}`);
    await section.getByRole('textbox', { name: 'Allergies and notes' }).fill('Tree nuts: carries an auto-injector.\nAsk before new snacks.');

    // A failed save keeps the draft and the form.
    await page.route(allergies, (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.fallback());
    const save = section.getByRole('button', { name: 'Save', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await activate(save, info);
    await expect(section.getByRole('alert')).toHaveText('Changes couldn’t be saved. Your draft is still here.');
    await expect(section.getByRole('textbox', { name: 'Allergies and notes' })).toHaveValue(/auto-injector/);
    await fitsPage(page);
    await evidence(page, info, `allergies-save-failure-${theme}`);
    await page.unroute(allergies);

    // Mom saves first: Dad sees her latest values above his kept draft, then saves his draft on top of them.
    const latest = await mom.json<{ revision: number }>(mom.get(allergies));
    await mom.json(mom.put(allergies, { revision: latest.revision, values: { allergies: null, noKnownAllergies: true, foodPreferences: 'Vegetarian at school' } }));
    await activate(save, info);
    const conflict = section.locator('.latest');
    await expect(conflict.getByRole('alert')).toContainText('Your co-parent saved changes first.');
    await expect(conflict).toContainText('Vegetarian at school');
    await expect(section.getByRole('textbox', { name: 'Allergies and notes' })).toHaveValue(/auto-injector/);
    await fitsPage(page);
    await evidence(page, info, `allergies-conflict-${theme}`);
    const saveDraft = section.getByRole('button', { name: 'Save my draft' });
    await saveDraft.scrollIntoViewIfNeeded();
    await expect(saveDraft).toBeInViewport();
    await activate(saveDraft, info);
    await expect(section.locator('section > p[role=status]')).toHaveText('Allergies & Food saved.');

    // Allergy text replaced the status; history shows Dad's change.
    const saved = await dad.json<{ values: { allergies: string | null; noKnownAllergies: boolean } }>(dad.get(allergies));
    expect(saved.values.noKnownAllergies).toBe(false);
    expect(saved.values.allergies).toContain('auto-injector');
    await expect(row('Allergies and notes').locator('dd')).toContainText('auto-injector');
    await activate(section.getByRole('button', { name: 'History' }), info);
    const entry = section.locator('#allergies-food-history article').first();
    await expect(entry).toContainText('Dad');
    await expect(entry.locator('.comparison > div').last()).toContainText('auto-injector');
    await fitsPage(page);
    await evidence(page, info, `allergies-history-${theme}`);
    await scan(page, info, `allergies-history-${theme}`);
  });
}
