import { expect, type Locator } from '@playwright/test';
import { nvdaTest, type NVDAPlaywright } from '@guidepup/playwright';
import { familyWithKai, type Family } from '../support/family';

/** Real keystrokes move focus; DOM queries only observe it. Each action gets fresh speech. */
export class ReaderJourney {
  private readonly transcript: { stage: string; phrases: string[] }[] = [];
  private stage = 'setup';
  constructor(readonly nvda: NVDAPlaywright) {}

  async checkpoint(stage: string) {
    this.transcript.push({ stage: this.stage, phrases: [...await this.nvda.spokenPhraseLog()] });
    await this.nvda.clearSpokenPhraseLog();
    this.stage = stage;
  }

  async heard(pattern: RegExp) {
    await expect.poll(async () => (await this.nvda.spokenPhraseLog()).join(' '),
      { message: `NVDA speech at ${this.stage}` }).toMatch(pattern);
  }

  async tabTo(target: Locator, name: RegExp, role: RegExp) {
    await expect(target).toBeVisible();
    for (let count = 0; count < 60; count++) {
      await this.checkpoint(`Tab ${count + 1} toward ${target}`);
      await this.nvda.press('Tab');
      if (await target.evaluate(element => element === element.ownerDocument.activeElement)) {
        await expect(target).toBeFocused();
        await this.heard(name);
        await this.heard(role);
        return;
      }
    }
    throw new Error(`NVDA could not Tab to ${target} within 60 keys`);
  }

  async attach() {
    this.transcript.push({ stage: this.stage, phrases: [...await this.nvda.spokenPhraseLog()] });
    return JSON.stringify(this.transcript, null, 2);
  }
}

export const test = nvdaTest.extend<{ family: Family; reader: ReaderJourney }>({
  nvdaStartOptions: { capture: true },
  family: async ({ context, baseURL }, use) => {
    // Guard BEFORE creating accounts: these fixtures must never target shared or production data.
    const app = new URL(baseURL!);
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(app.hostname);
    expect(app.protocol).toBe('https:');
    const mail = new URL(process.env['MAILPIT_URL'] ?? 'http://localhost:8025');
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(mail.hostname);
    const family = await familyWithKai();
    try {
      await context.addCookies((await family.dad.http.storageState()).cookies);
      await use(family);
    } finally {
      // Existing fixture disposes HTTP sessions; rows remain in the isolated disposable database.
      await family.dispose();
    }
  },
  reader: async ({ nvda }, use, info) => {
    const reader = new ReaderJourney(nvda);
    try {
      await use(reader);
    } finally {
      await info.attach('nvda-app-speech', { body: await reader.attach(), contentType: 'application/json' });
    }
  },
});
