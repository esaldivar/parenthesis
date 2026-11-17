import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #660: the approved Child Essentials Clothing & Shoes redesign (Figma page 279:2). Synthetic family only: Mom saves
// through the API as her own device would; Dad edits Clothing & Shoes in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`Clothing & Shoes keeps notes, the draft on failure and on a co-parent conflict (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const clothing = `/api/families/${familyId}/children/${kaiId}/essentials/clothing`;
    const notes = 'Needs a warm coat and long-sleeve tops.\nSoft waistbands work best.';
    await mom.json(mom.put(clothing, { revision: 0, values: { topSize: 'Youth M (10–12)', shoeSize: 'US kids 4', fitNotes: notes } }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.locator('[data-section=clothing] > summary'), info);
    const section = page.locator('app-clothing-section');
    await expect(page.getByRole('heading', { level: 2, name: 'Clothing & Shoes' })).toBeVisible();

    // The approved rows, Clothing notes (stored fit notes) under its label, and Updated only on Mom's changes.
    await expect(section.locator('section > .panel dt .label')).toHaveText(['Top size', 'Bottom size', 'Shoe size', 'Clothing notes']);
    const row = (label: string) => section.locator('section > .panel .row').filter({ has: page.locator('.label', { hasText: label }) });
    await expect(row('Clothing notes').locator('dd')).toHaveText(notes);
    await expect(row('Shoe size')).toContainText('Updated');
    await expect(row('Bottom size')).toContainText('Not set');
    await expect(row('Bottom size')).not.toContainText('Updated');
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await expect(page.locator('.children button[aria-pressed=true]')).toHaveCount(1);
    await fitsPage(page);
    await scan(page, info, `clothing-detail-${theme}`);

    // Edit starts with the saved values; the notes field is described by its helper text.
    await activate(section.getByRole('button', { name: 'Edit clothing and shoes' }), info);
    const notesField = section.getByRole('textbox', { name: 'Clothing notes (optional)' });
    await expect(notesField).toHaveValue(notes);
    await expect(notesField).toHaveAccessibleDescription('What’s needed, what fits, and any preferences.');
    await section.getByLabel('Bottom size').fill('Youth 12 slim; adjustable waist and a very long measurement note');

    // A failed save keeps the draft and the form.
    await page.route(clothing, (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.fallback());
    const save = section.getByRole('button', { name: 'Save', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await activate(save, info);
    await expect(section.getByRole('alert')).toHaveText('Changes couldn’t be saved. Your draft is still here.');
    await expect(section.getByLabel('Bottom size')).toHaveValue(/adjustable waist/);
    await fitsPage(page);
    await evidence(page, info, `clothing-save-failure-${theme}`);
    await page.unroute(clothing);

    // Mom saves first: Dad sees her latest values above his kept draft, and saves his draft on top of them.
    const latest = await mom.json<{ revision: number }>(mom.get(clothing));
    await mom.json(mom.put(clothing, { revision: latest.revision, values: { topSize: 'Youth L', shoeSize: 'US kids 4', fitNotes: 'Winter coat is available.' } }));
    await activate(save, info);
    const conflict = section.locator('.latest');
    await expect(conflict.getByRole('alert')).toContainText('Your co-parent saved changes first.');
    await expect(conflict).toContainText('Winter coat is available.');
    await expect(section.getByLabel('Bottom size')).toHaveValue(/adjustable waist/);
    await fitsPage(page);
    await evidence(page, info, `clothing-conflict-${theme}`);
    const saveDraft = section.getByRole('button', { name: 'Save my draft' });
    await saveDraft.scrollIntoViewIfNeeded();
    await expect(saveDraft).toBeInViewport();
    await activate(saveDraft, info);
    await expect(section.getByRole('status')).toHaveText('Clothing and shoes saved.');

    // History shows Dad's change; the stored field keeps its name.
    await activate(section.getByRole('button', { name: 'History' }), info);
    const entry = section.locator('#clothing-history article').first();
    await expect(entry).toContainText('Dad');
    await expect(entry.locator('.comparison > div').last()).toContainText('adjustable waist');
    await fitsPage(page);
    await evidence(page, info, `clothing-history-${theme}`);
    const saved = await dad.json<{ values: { fitNotes: string; topSize: string } }>(dad.get(clothing));
    expect(saved.values.fitNotes).toBe(notes);
    expect(saved.values.topSize).toBe('Youth M (10–12)');
  });
}
