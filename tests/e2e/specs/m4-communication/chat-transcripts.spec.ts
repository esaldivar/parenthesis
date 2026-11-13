import { expect, type Page } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { soloParent } from '../../support/family';
import { TIME_ZONE } from '../../support/data';

// Slice 3 of docs/design/m4-chat.md (#125): PDF transcripts. Synthetic family only: Dad uses the browser; Mom writes
// through the API, as her own device would. Exact time zone boundaries (inclusive end dates, local midnight) are proven
// in the API's integration tests with a controlled clock; here the dates are the family's today and this month.

interface Saved {
  id: string;
  fileName: string;
}

/** The family's today as `YYYY-MM-DD`. */
function familyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Another day of this month with no messages: the 1st, or the 2nd when today is the 1st. */
function quietDay(today: string): string {
  return `${today.slice(0, 8)}${today.endsWith('-01') ? '02' : '01'}`;
}

/** The date picker's label for a day, and the field's text for it. */
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shown = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC' });

async function pickDate(page: Page, field: 'Start date' | 'End date', date: string) {
  const input = page.locator(`input[name="${field === 'Start date' ? 'from' : 'to'}"]`);
  await page.locator('mat-form-field').filter({ has: input }).click();
  await expect(page.locator('mat-calendar')).toHaveCount(1);
  await page.locator(`.mat-calendar-body-cell[aria-label="${dayLabel(date)}"]`).click();
  await expect(page.locator('mat-calendar')).toHaveCount(0);
  await expect(input).toHaveValue(shown(date));
}

for (const theme of ['light', 'dark'] as const) {
  test(`a parent previews, saves and reopens a PDF transcript (${theme}) @m4 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const chat = `/api/families/${familyId}/chat`;
    await mom.json(mom.post(`${chat}/messages`, { clientMessageId: crypto.randomUUID(), text: 'Can you do the soccer pickup on Saturday?' }));
    await dad.json(dad.post(`${chat}/messages`, { clientMessageId: crypto.randomUUID(), text: 'Yes, I can. What time is it again?' }));
    const today = familyToday();
    const quiet = quietDay(today);

    await signIn(page, dad.email);
    await page.goto('/messages');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Messages with Mom');

    // Desktop keeps Transcripts in a left column; phones open their own screen from the document icon.
    const desktop = page.viewportSize()!.width >= 1024;
    if (desktop) {
      await expect(page.getByRole('complementary', { name: 'Transcripts' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Transcripts' })).toBeHidden();
    } else {
      await expect(page.getByRole('complementary', { name: 'Transcripts' })).toBeHidden();
      await activate(page.getByRole('link', { name: 'Transcripts' }), info);
      await expect(page).toHaveURL(/\/messages\/transcripts$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Transcripts');
    }
    await expect(page.getByText('No saved transcripts yet.')).toBeVisible();

    // A reversed range is refused beside its date, without leaving the dialog.
    const opener = page.getByRole('button', { name: 'Save transcript' });
    await activate(opener, info);
    const dialog = page.getByRole('dialog', { name: 'Save transcript' });
    await expect(dialog).toBeVisible();
    await activate(dialog.getByLabel('Date range'), info);
    const [early, late] = [today, quiet].sort();
    await pickDate(page, 'Start date', late!);
    await pickDate(page, 'End date', early!);
    await activate(dialog.getByRole('button', { name: 'Preview PDF' }), info);
    await expect(dialog.locator('.field-error')).toHaveText('The end date can’t be before the start date.');
    await scan(page, info, `${theme}-transcript-reversed`);

    // An empty range keeps its dates and offers no export.
    await pickDate(page, 'Start date', quiet);
    await pickDate(page, 'End date', quiet);
    await activate(dialog.getByRole('button', { name: 'Preview PDF' }), info);
    await expect(dialog.getByRole('status')).toHaveText('No messages in this date range.');
    await expect(page.locator('input[name="from"]')).toHaveValue(shown(quiet));
    await expect(dialog.getByRole('link', { name: 'Download PDF' })).toHaveCount(0);

    // A single day (today, both dates included) previews both parents' messages with names and times.
    await pickDate(page, 'Start date', today);
    await pickDate(page, 'End date', today);
    await activate(dialog.getByRole('button', { name: 'Preview PDF' }), info);
    const preview = page.getByRole('dialog', { name: 'Transcript preview' });
    await expect(preview.getByRole('heading', { name: 'Communication Transcript' })).toBeVisible();
    await expect(preview.locator('.paper-messages li').first()).toContainText(/\d{1,2}:\d{2}:\d{2} [AP]M UTC[+-]/);
    await expect(preview.locator('.paper-messages li').first()).toContainText('Can you do the soccer pickup on Saturday?');
    await expect(preview.locator('.paper-messages li').nth(1)).toContainText('Yes, I can. What time is it again?');
    const fileName = `Chat_${today}_to_${today}.pdf`;
    await expect(preview.locator('.file-name')).toHaveText(fileName);
    await fitsPage(page);
    await evidence(page, info, `${theme}-transcript-preview`);
    await scan(page, info, `${theme}-transcript-preview`);

    // Download PDF is a device copy, separate from Save: nothing is saved by it.
    const download = preview.getByRole('link', { name: 'Download PDF' });
    await expect(download).toHaveAttribute('download', fileName);
    const pdf = await dad.get((await download.getAttribute('href'))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['content-disposition']).toContain('attachment');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    expect(await dad.json<Saved[]>(dad.get(`${chat}/transcripts`))).toEqual([]);

    // Save keeps it in Parenthesis; the dialog closes back to Save transcript.
    await activate(preview.getByRole('button', { name: 'Save transcript' }), info);
    await expect(preview).toHaveCount(0);
    await expect(opener).toBeFocused();
    const entry = page.locator('.saved-item').filter({ hasText: fileName });
    await expect(entry).toBeVisible();

    // It's still there after a reload, and reopens exactly the saved PDF, for Dad only.
    await page.reload();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('target', '_blank');
    const href = (await entry.getAttribute('href'))!;
    const reopened = await dad.get(href);
    expect(reopened.status()).toBe(200);
    expect(reopened.headers()['cache-control']).toBe('no-store');
    expect((await reopened.body()).subarray(0, 4).toString()).toBe('%PDF');
    expect((await mom.get(href)).status()).toBe(404);
    expect(await mom.json<Saved[]>(mom.get(`${chat}/transcripts`))).toEqual([]);
    await fitsPage(page);
    await evidence(page, info, `${theme}-transcript-saved`);
    await scan(page, info, `${theme}-transcript-saved`);

    if (!desktop) {
      await activate(page.getByRole('link', { name: 'Back to Messages' }), info);
      await expect(page).toHaveURL(/\/messages$/);
    }
  });
}

test('a parent from another family can’t list, preview or open transcripts @m4 @regression', async ({ family }) => {
  const { dad: stranger } = await soloParent('Stranger');
  try {
    const chat = `/api/families/${family.familyId}/chat`;
    await family.dad.json(family.dad.post(`${chat}/messages`, { clientMessageId: crypto.randomUUID(), text: 'Hi' }));
    const saved = await family.dad.json<Saved>(family.dad.post(`${chat}/transcripts`, { from: null, to: null }));
    expect([403, 404]).toContain((await stranger.get(`${chat}/transcripts`)).status());
    expect([403, 404]).toContain((await stranger.get(`${chat}/transcripts/preview`)).status());
    expect([403, 404]).toContain((await stranger.get(`${chat}/transcripts/pdf`)).status());
    expect([403, 404]).toContain((await stranger.get(`${chat}/transcripts/${saved.id}/pdf`)).status());
  } finally {
    await stranger.dispose();
  }
});
