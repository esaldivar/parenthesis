import { expect, type Page } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { soloParent } from '../../support/family';

// Slice 2 of docs/design/m4-chat.md (#125): calendar event cards and the compact desktop chat. Synthetic family only:
// Dad uses the browser; Mom acts through the API, as her own device would.

interface Created {
  id: string;
}

/** Saturday a week or more from now, 10:30 to 12:00 Chicago time (16:30 UTC in standard time, 15:30 in daylight time). */
function nextSaturday(): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7 + ((6 - date.getUTCDay() + 7) % 7));
  date.setUTCHours(17, 0, 0, 0);
  return date;
}

async function shareFromPicker(page: Page, info: Parameters<typeof activate>[1], search: string, title: string) {
  await activate(page.getByRole('button', { name: 'Share a calendar event' }), info);
  const dialog = page.getByRole('dialog', { name: 'Find a calendar event' });
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  await dialog.getByRole('searchbox').fill(search);
  await expect(dialog.getByRole('status')).toHaveText(/event(s)? found/);
  await activate(dialog.getByRole('button', { name: new RegExp(title) }), info);
  await expect(dialog).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`parents share calendar events as cards that follow the calendar (${theme}) @m4 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const base = `/api/families/${familyId}`;
    const start = nextSaturday();
    const game = await dad.json<Created>(dad.post(`${base}/calendar/events`, {
      category: 'Activity', title: 'Soccer game', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
    }));

    await signIn(page, dad.email);
    await page.goto('/messages');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Messages with Mom');

    // No results is said plainly; then a search by name puts the event in the draft to review.
    await activate(page.getByRole('button', { name: 'Share a calendar event' }), info);
    const dialog = page.getByRole('dialog', { name: 'Find a calendar event' });
    await dialog.getByRole('searchbox').fill('piano recital');
    await expect(dialog.getByRole('status')).toHaveText('No events match. Try another name or date.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Share a calendar event' })).toBeFocused();

    await shareFromPicker(page, info, 'soccer', 'Soccer game');
    await expect(page.locator('.draft-event')).toContainText('Soccer game');
    const composer = page.getByLabel('Message Mom');
    await expect(composer).toBeFocused();
    await composer.fill('Here’s the game info.');
    await scan(page, info, `${theme}-chat-draft-event`);
    await activate(page.getByRole('button', { name: 'Send', exact: true }), info);
    const sent = page.locator('.message--yours').last();
    await expect(sent.getByRole('link', { name: /Open in calendar: Soccer game/ })).toBeVisible();
    await expect(page.locator('.draft-event')).toHaveCount(0);

    // Mom's copy is read with her own calendar's rules.
    const moms = await mom.json<{ messages: { eventId: string; event: { title: string; status: string } }[] }>(mom.get(`${base}/chat`));
    expect(moms.messages.at(-1)!.eventId).toBe(game.id);
    expect(moms.messages.at(-1)!.event).toMatchObject({ title: 'Soccer game', status: 'Confirmed' });

    // Mom shares a proposal: it arrives live and never reads as confirmed.
    const play = await mom.json<Created>(mom.post(`${base}/calendar/events`, {
      category: 'Joint', title: 'School play', startsAt: new Date(start.getTime() + 86_400_000).toISOString(),
      endsAt: new Date(start.getTime() + 86_400_000 + 3_600_000).toISOString(),
    }));
    await mom.json(mom.post(`${base}/chat/messages`, { clientMessageId: crypto.randomUUID(), text: 'And this?', eventId: play.id }));
    const proposal = page.locator('.message').last();
    await expect(proposal.getByRole('link', { name: /School play/ })).toBeVisible();
    await expect(proposal.locator('app-chat-event-card')).toContainText('Pending approval');
    await fitsPage(page);
    await evidence(page, info, `${theme}-event-cards`);
    await scan(page, info, `${theme}-event-cards`);

    // When Dad cancels the game, its card says it's gone, for both parents.
    expect((await dad.delete(`${base}/calendar/events/${game.id}`)).status()).toBe(204);
    await page.reload();
    await expect(page.locator('.message--yours').last().locator('app-chat-event-card')).toHaveText('This event isn’t on your calendar any more.');
    const momsAfter = await mom.json<{ messages: { event: { available: boolean } | null }[] }>(mom.get(`${base}/chat`));
    expect(momsAfter.messages.filter((m) => m.event?.available === false)).toHaveLength(1);

    // A card opens the event on the Calendar, with the Calendar's own details.
    await activate(page.locator('.message').last().getByRole('link', { name: /School play/ }), info);
    await expect(page).toHaveURL(new RegExp(`/calendar\\?.*event=${play.id}`));
    await expect(page.getByRole('dialog')).toContainText('School play');
  });
}

test('a parent from another family can’t share or read their events in this chat @m4 @regression', async ({ family }) => {
  const { dad: stranger, familyId: theirs } = await soloParent('Stranger');
  try {
    const start = nextSaturday();
    const secret = await stranger.json<Created>(stranger.post(`/api/families/${theirs}/calendar/events`, {
      category: 'Activity', title: 'Secret soccer', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    }));
    const shared = await family.dad.post(`/api/families/${family.familyId}/chat/messages`, {
      clientMessageId: crypto.randomUUID(), text: 'Look', eventId: secret.id,
    });
    expect(shared.status()).toBe(400);
    expect([403, 404]).toContain((await stranger.get(`/api/families/${family.familyId}/chat/messages/${crypto.randomUUID()}`)).status());
  } finally {
    await stranger.dispose();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`the compact desktop chat keeps the conversation and draft over any page (${theme}) @m4 @regression`, async ({ page, family }, info) => {
    test.skip(info.project.name !== 'chromium', 'The compact chat is desktop only; phones use the full-screen page.');
    await page.emulateMedia({ colorScheme: theme });
    const { dad, familyId } = family;
    const start = nextSaturday();
    await dad.json(dad.post(`/api/families/${familyId}/calendar/events`, {
      category: 'Activity', title: 'Soccer game', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
    }));
    await signIn(page, dad.email);
    await page.goto('/calendar');
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

    // Close puts it away.
    await page.getByRole('button', { name: 'Minimize to compact chat' }).click();
    await page.getByRole('region', { name: 'Compact chat' }).getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByRole('region', { name: /Compact chat/ })).toHaveCount(0);
    await fitsPage(page);
  });
}
