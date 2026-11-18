import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #667: the approved Child Essentials What Helps redesign (Figma page 878:194). Synthetic family only: Mom saves
// through the API as her own device would; Dad edits What Helps in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`What Helps keeps the draft on the limit, a failed save and a co-parent conflict (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const whatHelps = `/api/families/${familyId}/children/${kaiId}/essentials/what-helps`;
    await mom.json(mom.put(whatHelps, { revision: 0, values: { comfortItems: 'Soft blanket\nStuffed rabbit', calmingStrategies: null } }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.locator('[data-section=whatHelps] > summary'), info);
    const section = page.locator('app-what-helps-section');
    await expect(page.getByRole('heading', { level: 2, name: 'What Helps' })).toBeVisible();

    // Saved values: Mom's multiline comfort items with Updated by the label, Not set for the empty field.
    const row = (label: string) => section.locator('.panel .row').filter({ has: page.locator('.label', { hasText: label }) });
    await expect(row('Comfort items').locator('dd')).toHaveText('Soft blanket\nStuffed rabbit');
    await expect(row('Comfort items').locator('.updated')).toHaveText('Updated');
    await expect(row('Calming strategies').locator('dd')).toHaveText('Not set');
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await fitsPage(page);
    await evidence(page, info, `what-helps-saved-${theme}`);
    await scan(page, info, `what-helps-saved-${theme}`);

    // Edit starts with the saved values; over 1,000 characters shows the message and count and keeps Save off.
    await activate(section.getByRole('button', { name: 'Edit What Helps' }), info);
    const comfort = section.getByRole('textbox', { name: 'Comfort items' });
    await expect(comfort).toHaveValue('Soft blanket\nStuffed rabbit');
    await comfort.fill('x'.repeat(1012));
    await expect(comfort).toHaveAttribute('aria-invalid', 'true');
    await expect(comfort).toHaveAccessibleDescription(/Keep this to 1,000 characters or fewer\.\s*1,012 \/ 1,000 characters/);
    await expect(section.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await fitsPage(page);
    await evidence(page, info, `what-helps-validation-${theme}`);
    await comfort.fill('Soft blanket\nStuffed rabbit and night light');
    await section.getByRole('textbox', { name: 'Calming strategies (optional)' }).fill('Quiet corner, slow breaths');

    // A failed save keeps the draft and offers Retry.
    await page.route(whatHelps, (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.fallback());
    await activate(section.getByRole('button', { name: 'Save', exact: true }), info);
    await expect(section.getByRole('alert')).toHaveText('Changes couldn’t be saved. Your draft is still here.');
    await expect(comfort).toHaveValue(/night light/);
    const retry = section.getByRole('button', { name: 'Retry' });
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport();
    await fitsPage(page);
    await evidence(page, info, `what-helps-save-failure-${theme}`);
    await page.unroute(whatHelps);

    // Mom saves first: Dad sees her latest values above his kept draft, and saves his draft on top of them.
    const latest = await mom.json<{ revision: number }>(mom.get(whatHelps));
    await mom.json(mom.put(whatHelps, { revision: latest.revision, values: { comfortItems: 'Weighted blanket', calmingStrategies: 'Hum a song' } }));
    await activate(retry, info);
    await expect(section.getByRole('alert')).toContainText('Your co-parent saved changes first.');
    await expect(section.locator('form .inset')).toContainText('Calming strategies: Hum a song');
    await expect(comfort).toHaveValue(/night light/);
    await fitsPage(page);
    await evidence(page, info, `what-helps-conflict-${theme}`);
    const saveDraft = section.getByRole('button', { name: 'Save my draft' });
    await saveDraft.scrollIntoViewIfNeeded();
    await expect(saveDraft).toBeInViewport();
    await activate(saveDraft, info);
    await expect(section.locator('section > p[role=status]')).toHaveText('What Helps saved.');

    // History shows Dad's change; Close history returns to the saved values and the History button.
    await activate(section.getByRole('button', { name: 'History' }), info);
    const entry = section.locator('#what-helps-history .change').first();
    await expect(entry).toContainText('Dad');
    await expect(entry.locator('.inset').last()).toContainText('Quiet corner, slow breaths');
    await fitsPage(page);
    await evidence(page, info, `what-helps-history-${theme}`);
    await scan(page, info, `what-helps-history-${theme}`);
    await activate(section.getByRole('button', { name: 'Close history' }), info);
    await expect(section.getByRole('button', { name: 'History' })).toBeFocused();
    const saved = await dad.json<{ values: { comfortItems: string; calmingStrategies: string } }>(dad.get(whatHelps));
    expect(saved.values).toEqual({ comfortItems: 'Soft blanket\nStuffed rabbit and night light', calmingStrategies: 'Quiet corner, slow breaths' });
  });
}
