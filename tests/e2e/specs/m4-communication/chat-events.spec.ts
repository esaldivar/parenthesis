import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { soloParent } from '../../support/family';
import { type Created, nextSaturday, shareFromPicker } from '../../support/chat';

// Slice 2 of docs/design/m4-chat.md (#125): calendar event cards and the compact desktop chat. Synthetic family only:
// Dad uses the browser; Mom acts through the API, as her own device would.

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
