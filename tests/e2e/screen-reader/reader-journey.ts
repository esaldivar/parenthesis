import { expect, type Locator } from '@playwright/test';

/** The part of a Guidepup reader (NVDA or VoiceOver) that a keyboard journey needs. */
export interface JourneyReader {
  press(key: string): Promise<void>;
  spokenPhraseLog(): Promise<string[]>;
  clearSpokenPhraseLog(): Promise<void>;
  lastSpokenPhrase(): Promise<string>;
}

/**
 * Real keystrokes move focus; DOM queries only observe it. Each action gets fresh speech.
 * NVDA logs everything it says. VoiceOver logs speech that follows a Guidepup command, so a live-region
 * announcement that arrives later is read from its current last phrase too (`live`).
 */
export class ReaderJourney {
  private readonly transcript: { stage: string; phrases: string[] }[] = [];
  private stage = 'setup';
  constructor(readonly reader: JourneyReader, readonly name: string, private readonly live = false) {}

  private async speech() {
    const phrases = [...await this.reader.spokenPhraseLog()];
    if (this.live) {
      const last = await this.reader.lastSpokenPhrase();
      if (last && phrases.at(-1) !== last) phrases.push(last);
    }
    return phrases;
  }

  async checkpoint(stage: string) {
    this.transcript.push({ stage: this.stage, phrases: await this.speech() });
    await this.reader.clearSpokenPhraseLog();
    this.stage = stage;
  }

  async heard(pattern: RegExp) {
    await expect.poll(async () => (await this.speech()).join(' '),
      { message: `${this.name} speech at ${this.stage}` }).toMatch(pattern);
  }

  async tabTo(target: Locator, name: RegExp, role: RegExp, key: 'Tab' | 'Shift+Tab' = 'Tab') {
    await expect(target).toBeVisible();
    for (let count = 0; count < 60; count++) {
      await this.checkpoint(`Tab ${count + 1} toward ${target}`);
      await this.reader.press(key);
      if (await target.evaluate(element => element === element.ownerDocument.activeElement)) {
        await expect(target).toBeFocused();
        await this.heard(name);
        await this.heard(role);
        return;
      }
    }
    throw new Error(`${this.name} could not Tab to ${target} within 60 keys`);
  }

  async attach() {
    this.transcript.push({ stage: this.stage, phrases: await this.speech() });
    return JSON.stringify(this.transcript, null, 2);
  }
}
