import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { nextSaturday, shareFromPicker } from '../../support/chat';

// Slice 2 of docs/design/m4-chat.md (#125): the compact desktop chat, desktop only (1024px and wider), so the phone
// profiles don't load this file (*.desktop.spec.ts). Synthetic family only.

for (const theme of ['light', 'dark'] as const) {
  test(`the compact desktop chat keeps the conversation and draft over any page (${theme}) @m4 @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, familyId } = family;
    const start = nextSaturday();
    await dad.json(dad.post(`/api/families/${familyId}/calendar/events`, {
      category: 'Activity', title: 'Soccer game', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
    }));
    await signIn(page, dad.email);
    await page.goto('/calendar');
    // Always there on desktop, minimized to a bar at the bottom right, like a messaging tray.
    await expect(page.getByRole('region', { name: 'Compact chat, minimized' })).toBeVisible();
    await activate(page.locator('nav.sidenav').getByRole('link', { name: /^Messages/ }), info);

    // Draft text and a chosen event, then Minimize docks them over the page the parent came from.
    await page.getByLabel('Message Mom').fill('I’ll bring the water bottles.');
    await shareFromPicker(page, info, 'soccer', 'Soccer game');
    await page.getByRole('button', { name: 'Minimize to compact chat' }).click();
    await expect(page).toHaveURL(/\/calendar/);
    const dock = page.getByRole('region', { name: 'Compact chat' });
    await expect(dock.getByRole('heading', { level: 2 })).toHaveText('Messages with Mom');
    await expect(dock.getByLabel('Message Mom')).toHaveValue('I’ll bring the water bottles.');
    await expect(dock.locator('.draft-event')).toContainText('Soccer game');
    await evidence(page, info, `${theme}-compact-chat`);
    await scan(page, info, `${theme}-compact-chat`);

    // The page around it still works: the calendar's own controls respond while the chat stays open.
    await page.getByRole('main').getByRole('button', { name: /Next/ }).first().click();
    await expect(dock).toBeVisible();

    // Minimize folds it to a bar with focus on it; opening it again brings the same draft back.
    await dock.getByRole('button', { name: 'Minimize chat' }).click();
    const bar = page.getByRole('region', { name: 'Compact chat, minimized' });
    await expect(bar.getByRole('button', { name: /Open the compact chat/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dock.getByLabel('Message Mom')).toBeFocused();
    await expect(dock.getByLabel('Message Mom')).toHaveValue('I’ll bring the water bottles.');

    // Expand opens the full page with the same draft and event; sending there clears both everywhere.
    await dock.getByRole('button', { name: 'Expand to full chat' }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByLabel('Message Mom')).toHaveValue('I’ll bring the water bottles.');
    await expect(page.locator('.draft-event')).toContainText('Soccer game');
    await expect(page.getByRole('region', { name: 'Compact chat' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('.message--yours').last()).toContainText('I’ll bring the water bottles.');
    await expect(page.locator('.message--yours').last().getByRole('link', { name: /Soccer game/ })).toBeVisible();

    // Nothing puts it away completely: minimized again, it's a bar at the bottom.
    await page.getByRole('button', { name: 'Minimize to compact chat' }).click();
    await page.getByRole('region', { name: 'Compact chat' }).getByRole('button', { name: 'Minimize chat' }).click();
    await expect(page.getByRole('region', { name: 'Compact chat, minimized' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close chat' })).toHaveCount(0);
    await fitsPage(page);
  });
}

test('a new message pulses a dot on the minimized chat bar, and opening it reads the message @m4 @regression', async ({ page, family }) => {
  const { dad, mom, familyId } = family;
  await signIn(page, dad.email);
  await page.goto('/calendar');
  const bar = page.getByRole('region', { name: 'Compact chat, minimized' });
  await expect(bar.getByRole('button', { name: /^Messages.*Open the compact chat$/ })).toBeVisible();
  await expect(bar.locator('.dot')).toHaveCount(0);

  await mom.json(mom.post(`/api/families/${familyId}/chat/messages`, { clientMessageId: crypto.randomUUID(), text: 'Can you do the soccer pickup on Saturday?' }));
  const restore = bar.getByRole('button', { name: /unread messages/ });
  await expect(restore).toBeVisible();
  await expect(bar.locator('.dot')).toBeVisible();

  await restore.click();
  const dock = page.getByRole('region', { name: 'Compact chat' });
  await expect(dock.getByText('Can you do the soccer pickup on Saturday?')).toBeVisible();
  await dock.getByRole('button', { name: 'Minimize chat' }).click();
  await expect(bar.locator('.dot')).toHaveCount(0);
  expect((await dad.json<{ hasUnread: boolean }>(dad.get(`/api/families/${familyId}/chat/unread`))).hasUnread).toBe(false);
});
