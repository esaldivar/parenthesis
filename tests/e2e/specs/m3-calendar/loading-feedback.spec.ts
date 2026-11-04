import { expect, Locator } from '@playwright/test';
import { addHours, nextMonday } from '../../support/data';
import { evidence, fitsPage, fitsWidth, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #413: real Angular rendering and calendar API saves, with controlled upload responses.
// Browser emulation and DOM status checks do not certify a physical device or spoken output.
async function indicatorFits(indicator: Locator, reduced: boolean) {
  await expect(indicator.getByRole('status')).toBeVisible();
  await expect(indicator.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(indicator.locator('.parents')).toHaveCSS('animation-name', reduced ? 'none' : /orbit$/);
  // Only the two caregiver paths rotate. The child and rays stay outside the animated group.
  await expect(indicator.locator('.parents path')).toHaveCount(2);
  await expect(indicator.locator('svg > g > path')).toHaveCount(2);
}

for (const theme of ['light', 'dark'] as const) {
  for (const reduced of [false, true]) {
    test(`loading feedback survives save/upload failure and retry, ${theme}, reduced motion ${reduced} (#413)`, async ({ page, family }, info) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const start = addHours(nextMonday(), 40);
      const event = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Loading feedback practice',
        startsAt: start.toISOString(), endsAt: addHours(start, 1).toISOString(),
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/${event.id}/edit`);
      await page.getByLabel('Title', { exact: true }).fill('Retried loading practice');
      const endpoint = `**${path}/${event.id}`;
      let requests = 0;
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route(endpoint, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        requests++;
        await held;
        await route.fulfill({ status: 503, json: { status: 503, title: 'Synthetic interruption', detail: 'Try saving again.' } });
      });
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      const saving = page.locator('app-event-edit-page app-loading-indicator');
      await expect(saving.getByRole('status')).toHaveText('Saving…');
      await indicatorFits(saving, reduced);
      await fitsWidth(saving, page);
      await fitsPage(page);
      await scan(page, info, `${theme}-${reduced}-saving`);
      await evidence(page, info, `${theme}-${reduced}-saving`);
      // A second form submission must not issue another request, even outside the disabled button.
      await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
      expect(requests).toBe(1);
      release();
      await expect(page.getByRole('alert').filter({ hasText: 'Synthetic interruption' })).toBeVisible();
      await expect(saving.locator('svg')).toHaveCount(0);
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Retried loading practice');
      await page.unroute(endpoint);
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(page.locator('app-toast-host')).toContainText('Retried loading practice');

      await page.goto('/settings');
      const editor = page.locator('app-profile-photo-settings app-photo-editor').filter({ hasText: 'Kai' });
      await expect(editor).toBeVisible();
      // A tiny synthetic PNG, no people or identifying metadata.
      await editor.locator('input[type=file]').setInputFiles({
        name: 'synthetic.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=', 'base64'),
      });
      let uploads = 0;
      let finishUpload!: () => void;
      const uploadHeld = new Promise<void>(resolve => { finishUpload = resolve; });
      const uploadEndpoint = `**/api/families/${family.familyId}/photos/children/${family.kaiId}`;
      await page.route(uploadEndpoint, async route => {
        uploads++;
        await uploadHeld;
        await route.fulfill({ status: 429, json: { status: 429 } });
      });
      await editor.getByRole('button', { name: 'Save photo', exact: true }).click();
      const uploading = editor.locator('app-loading-indicator');
      await expect(uploading.getByRole('status')).toHaveText('Uploading photo…');
      await indicatorFits(uploading, reduced);
      await expect(uploading.getByRole('progressbar')).toHaveCount(0); // fetch does not supply byte progress
      await fitsWidth(uploading, page);
      await fitsPage(page);
      await scan(page, info, `${theme}-${reduced}-uploading`);
      await evidence(page, info, `${theme}-${reduced}-uploading`);
      await expect(editor.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
      expect(uploads).toBe(1);
      finishUpload();
      await expect(editor.getByRole('alert')).toContainText('Please wait');
      await expect(editor.getByText('Preview. It isn’t saved yet.')).toBeVisible();
      await expect(uploading.locator('svg')).toHaveCount(0);
      await expect(uploading.getByRole('status', { includeHidden: true })).toBeEmpty();
      await page.unroute(uploadEndpoint);
      // Isolate upload UI acceptance from storage; server persistence has separate integration coverage.
      await page.route(uploadEndpoint, route => route.fulfill({
        status: 200, json: { kind: 'child', id: family.kaiId, url: '/synthetic-saved-photo.png' },
      }));
      await editor.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(editor.getByRole('status')).toHaveText('Photo saved.');
      await expect(editor.getByText('Preview. It isn’t saved yet.')).toHaveCount(0);
    });
  }
}
