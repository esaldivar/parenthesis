import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #655: the approved Child Essentials School redesign (Figma page 133:2). Synthetic family only: Mom saves through the
// API as her own device would; Dad edits School in the browser.

for (const theme of ['light', 'dark'] as const) {
  test(`School saves its new contact fields, shows the co-parent's change and keeps Save reachable (${theme}) @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const school = `/api/families/${familyId}/children/${kaiId}/essentials/school`;
    await mom.json(mom.put(school, { revision: 0, values: { grade: '3', homeroomTeacher: 'Ms. Lee' } }));

    await signIn(page, dad.email);
    await page.goto('/child-essentials');
    await activate(page.locator('[data-section=school] > summary'), info);
    const section = page.locator('app-school-section');
    await expect(page.getByRole('heading', { level: 2, name: 'School' })).toBeVisible();

    // The approved field order, Not set for the new fields, and the plain "Updated" cue on Mom's changes only.
    await expect(section.locator('dt .label')).toHaveText([
      'School name', 'School address (optional)', 'Grade', 'Homeroom teacher', 'Teacher email (optional)',
      'Teacher phone number (optional)', 'Parent concerns',
    ]);
    const row = (label: string) => section.locator('.row').filter({ has: page.locator('.label', { hasText: label }) });
    await expect(row('Homeroom teacher')).toContainText('Updated');
    await expect(row('School name')).toContainText('Not set');
    await expect(row('School name')).not.toContainText('Updated');
    // The chosen child is shown by the highlighted row alone, still exposed as pressed.
    await expect(page.locator('.children app-icon')).toHaveCount(0);
    await expect(page.locator('.children button[aria-pressed=true]')).toHaveCount(1);
    await fitsPage(page);
    await scan(page, info, `school-detail-${theme}`);

    // Edit: every field and Save are reachable by scrolling above the phone's bottom navigation.
    await activate(section.getByRole('button', { name: 'Edit School' }), info);
    await section.getByLabel('School name').fill('Example Elementary');
    await section.getByLabel('School address (optional)').fill('1 Sample Way, Testville');
    await section.getByLabel('Teacher email (optional)').fill('teacher@example.test');
    await section.getByLabel('Teacher phone number (optional)').fill('512-555-0100');
    const save = section.getByRole('button', { name: 'Save' });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await fitsPage(page);
    await evidence(page, info, `school-edit-${theme}`);
    await activate(save, info);
    await expect(section.getByRole('status')).toHaveText('School saved.');

    // The saves reload, the U.S. number is formatted for display, and history shows the change with its author.
    await page.reload();
    await activate(page.locator('[data-section=school] > summary'), info);
    await expect(row('School name')).toContainText('Example Elementary');
    await expect(row('Teacher phone number (optional)')).toContainText('(512) 555-0100');
    await activate(section.getByRole('button', { name: 'History' }), info);
    const latest = section.locator('#school-history article').first();
    await expect(latest).toContainText('Dad');
    await expect(latest.locator('.comparison > div').last()).toContainText('Example Elementary');
    await fitsPage(page);
    await evidence(page, info, `school-history-${theme}`);
    expect((await dad.json<{ values: { teacherPhone: string } }>(dad.get(school))).values.teacherPhone).toBe('512-555-0100');
  });
}
