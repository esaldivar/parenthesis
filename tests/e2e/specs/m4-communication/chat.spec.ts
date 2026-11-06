import { expect, type Page } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { soloParent } from '../../support/family';

// #125 and the M4 Chat handoff (docs/design/m4-chat.md, slice 1). Synthetic family only: Dad uses the browser, Mom
// writes through the API, as her own device would. Pushes reach Dad's page over the live connection.

interface Sent {
  id: string;
  clientMessageId: string;
  text: string;
}

const messagesLink = (page: Page) =>
  page.locator('nav:visible').getByRole('link', { name: /^Messages/ });

for (const theme of ['light', 'dark'] as const) {
  test(`two parents exchange messages live, with unread, typing, Read and Retry (${theme}) @m4 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dad, mom, familyId } = family;
    const chat = `/api/families/${familyId}/chat`;
    const send = (text: string) => mom.json<Sent>(mom.post(`${chat}/messages`, { clientMessageId: crypto.randomUUID(), text }));

    await send('Can you do the soccer pickup on Saturday?');
    await signIn(page, dad.email);

    // 1. Unread in navigation.
    await expect(messagesLink(page)).toHaveAccessibleName(/unread messages/);
    await evidence(page, info, `${theme}-unread`);

    // 2. First unread: the divider sits before Mom's message, and opening marks it read.
    await activate(messagesLink(page), info);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Messages with Mom');
    await expect(page.locator('.divider')).toHaveText('New messages');
    await expect(page.locator('.message').first()).toContainText('Can you do the soccer pickup on Saturday?');
    await expect.poll(async () => (await dad.json<{ count: number }>(dad.get(`${chat}/unread`))).count).toBe(0);
    await fitsPage(page);
    await scan(page, info, `${theme}-chat`);

    // 3. Typing, then her message arrives live and the typing line goes.
    expect((await mom.post(`${chat}/typing`)).status()).toBe(204);
    await expect(page.locator('.typing')).toHaveText(/Mom is typing…/);
    await send('Game ends at 11:30, so pickup around 11:45 at the field.');
    await expect(page.locator('.message').last()).toContainText('Game ends at 11:30');
    await expect(page.locator('.typing')).toHaveText('');

    // Dad replies; when Mom reads it, Read shows under it.
    const composer = page.getByLabel('Message Mom');
    await composer.fill('Yes, I can be there at 11:45.');
    await activate(page.getByRole('button', { name: 'Send', exact: true }), info);
    await expect(composer).toHaveValue('');
    const reply = page.locator('.message--yours').last();
    await expect(reply).toContainText('Yes, I can be there at 11:45.');
    // The bubble shows while sending; wait until the server has stored it before Mom reads it.
    await expect.poll(async () => (await mom.json<{ messages: Sent[] }>(mom.get(chat))).messages.at(-1)?.text).toBe('Yes, I can be there at 11:45.');
    const latest = (await mom.json<{ messages: Sent[] }>(mom.get(chat))).messages.at(-1)!;
    expect((await mom.put(`${chat}/read`, { messageId: latest.id })).status()).toBe(204);
    await expect(reply.locator('.status')).toHaveText('Read');
    await scan(page, info, `${theme}-read`);

    // 4. Failed to send: the text stays with Not sent, and Retry delivers it once.
    let failures = 0;
    await page.route('**/chat/messages', async (route) => {
      if (failures++ === 0) {
        await route.abort('connectionreset');
      } else {
        await route.continue();
      }
    });
    await composer.fill('I’ll bring the water bottles.');
    await composer.press('Enter');
    const failed = page.locator('.message--failed');
    await expect(failed).toContainText('Not sent');
    await expect(failed).toContainText('I’ll bring the water bottles.');
    await evidence(page, info, `${theme}-not-sent`);
    await scan(page, info, `${theme}-not-sent`);
    await activate(failed.getByRole('button', { name: /^Retry/ }), info);
    await expect(failed).toHaveCount(0);
    await expect(page.locator('.message--yours').last()).toContainText('I’ll bring the water bottles.');
    const all = (await mom.json<{ messages: Sent[] }>(mom.get(chat))).messages;
    expect(all.filter((m) => m.text === 'I’ll bring the water bottles.')).toHaveLength(1);
    await fitsPage(page);

    // Back leaves the conversation for Home.
    await activate(page.getByRole('link', { name: 'Back to Home' }), info);
    await expect(page).toHaveURL(/\/$/);
  });
}

test('a parent from another family can’t read or write the conversation @m4 @regression', async ({ family }) => {
  const { dad: stranger, familyId: theirs } = await soloParent('Stranger');
  try {
    const chat = `/api/families/${family.familyId}/chat`;
    expect([403, 404]).toContain((await stranger.get(chat)).status());
    expect([403, 404]).toContain((await stranger.post(`${chat}/messages`, { clientMessageId: crypto.randomUUID(), text: 'Hi' })).status());
    // Their own family's conversation is empty and separate.
    const own = await stranger.json<{ messages: unknown[] }>(stranger.get(`/api/families/${theirs}/chat`));
    expect(own.messages).toEqual([]);
  } finally {
    await stranger.dispose();
  }
});
