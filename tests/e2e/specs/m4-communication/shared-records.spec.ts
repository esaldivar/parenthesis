import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #477 and docs/design/shared-records-issue-477.md. Synthetic family only: Mom proposes and answers through the API, as
// her own device would; Dad uses the browser. Attachments are generated here, never real documents.

const pdf = { name: 'soccer-payment.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% synthetic\n%%EOF\n') };

interface Fund {
  id: string;
  approvalId: string;
}

for (const theme of ['light', 'dark'] as const) {
  test(`parents agree to a Shared Fund, report contributions with attachments, and keep a Child Support record (${theme}) @m4 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId, kaiId } = family;
    const root = `/api/families/${familyId}`;
    await mom.json<Fund>(mom.post(`${root}/shared-funds`, {
      title: 'Fall soccer fees', currency: 'USD', proposerShareMinor: 12000, coParentShareMinor: 18000, childIds: [kaiId],
    }));

    // 1. Shared records is in the navigation (under More on phones), with a dot: a proposal waits on Dad.
    await signIn(page, dad.email);
    const desktop = page.viewportSize()!.width >= 1024;
    if (desktop) {
      await activate(page.locator('nav.sidenav').getByRole('link', { name: /Shared records.*waiting on your response/ }), info);
    } else {
      await activate(page.locator('nav.bottomnav').getByRole('link', { name: /More.*Shared records waiting/ }), info);
      await activate(page.getByRole('link', { name: /^Shared records.*waiting on your response/ }), info);
    }
    await expect(page.getByRole('heading', { level: 1, name: /Shared records/ })).toBeVisible();
    await expect(page.getByText('Awaiting agreement')).toBeVisible();
    await expect(page.getByText(/You \$180\.00/)).toBeVisible();

    // 2. Dad agrees; the fund opens with an empty thermometer.
    await activate(page.getByRole('button', { name: 'Agree to proposal' }), info);
    await expect(page.locator('.badge').filter({ hasText: 'Agreed' })).toBeVisible();
    await expect(page.locator('app-record-progress')).toContainText('of $300.00 agreed target');

    // 3. Dad reports $40 paid to the vendor; a report can't go without its attachment.
    await activate(page.getByRole('button', { name: 'Report contribution' }), info);
    await page.getByLabel('Amount (USD)').fill('40');
    await activate(page.getByRole('button', { name: 'Submit contribution' }), info);
    await expect(page.getByRole('alert')).toContainText('A report can’t be sent without one.');
    await page.locator('app-report-form input[type="file"]').setInputFiles(pdf);
    await expect(page.locator('app-report-form')).toContainText('soccer-payment.pdf');
    await fitsPage(page);
    await scan(page, info, `${theme}-report-contribution`);
    await activate(page.getByRole('button', { name: 'Submit contribution' }), info);
    await expect(page.locator('app-record-progress')).toContainText('$40.00 awaiting acknowledgment');
    await expect(page.locator('app-record-history li')).toContainText('Awaiting acknowledgment');

    // 4. Mom acknowledges it on her device; Dad sees only acknowledged money fill the meter.
    const funds = await mom.json<{ entries: { id: string }[] }[]>(mom.get(`${root}/shared-funds`));
    expect((await mom.post(`${root}/shared-records/entries/${funds[0]!.entries[0]!.id}/acknowledge`, {})).status()).toBe(200);
    await page.reload();
    await expect(page.locator('app-record-progress')).toContainText('Acknowledged');
    await expect(page.locator('app-record-progress')).toContainText('$260.00 to reach target');
    await expect(page.locator('app-record-history li').first()).toContainText('Acknowledged');
    await evidence(page, info, `${theme}-shared-fund`);
    await scan(page, info, `${theme}-shared-fund`);

    // 5. A one-time Child Support record, kept apart and labeled as such; Dad pays and reports.
    await activate(page.getByRole('button', { name: 'New request' }), info);
    await activate(page.getByRole('radio', { name: /Child Support/ }), info);
    await page.getByLabel('Record title').fill('November 2026');
    await page.getByLabel('I pay').check();
    await page.getByLabel('Reference amount · optional').fill('500');
    await expect(page.locator('app-support-form')).toContainText('not a request for payment or an official record');
    await activate(page.getByRole('button', { name: 'Create record' }), info);
    await expect(page.locator('.badge.support')).toHaveText('Child Support');
    await activate(page.getByRole('button', { name: 'Report payment' }), info);
    await page.getByLabel('Amount (USD)').fill('250');
    await page.locator('app-report-form input[type="file"]').setInputFiles(pdf);
    await activate(page.getByRole('button', { name: 'Submit payment' }), info);
    await expect(page.locator('app-record-history li')).toContainText('Awaiting confirmation');
    await expect(page.getByText('Use your required payment channel.')).toBeVisible();
    await fitsPage(page);
    await evidence(page, info, `${theme}-child-support`);
    await scan(page, info, `${theme}-child-support`);

    // 6. Mom confirms receipt from her side; the record shows progress toward the reference amount.
    const records = await mom.json<{ id: string; entries: { id: string; canRespond: boolean }[] }[]>(mom.get(`${root}/child-support`));
    expect(records[0]!.entries[0]!.canRespond).toBe(true);
    expect((await mom.post(`${root}/shared-records/entries/${records[0]!.entries[0]!.id}/acknowledge`, {})).status()).toBe(200);
    await page.reload();
    await activate(page.getByRole('button', { name: /Child Support November 2026/ }), info);
    await expect(page.locator('app-record-progress')).toContainText('of $500.00 reference amount');
    await expect(page.locator('app-record-history li')).toContainText('Receipt confirmed');
  });
}
