import { expect, type Locator } from '@playwright/test';

/** The part of a Guidepup reader (NVDA or VoiceOver) that a keyboard journey needs. */
export interface JourneyReader {
  press(key: string): Promise<void>;
  type(text: string): Promise<void>;
  spokenPhraseLog(): Promise<string[]>;
  clearSpokenPhraseLog(): Promise<void>;
  lastSpokenPhrase(): Promise<string>;
}

/** Sends keys some other way than the reader (VoiceOver: straight to the browser page). */
export interface JourneyKeys {
  press(key: string): Promise<void>;
  type(text: string): Promise<void>;
}

/**
 * Keystrokes move focus; DOM queries only observe it. Each action gets fresh speech.
 * NVDA logs everything it says and sends keys itself. VoiceOver's log only holds speech that follows a Guidepup
 * command, so in `live` mode the journey also collects each new "last phrase" VoiceOver reports while it waits.
 */
export class ReaderJourney {
  private readonly transcript: { stage: string; phrases: string[] }[] = [];
  private stage = 'setup';
  private heardLive: string[] = [];
  private lastSeen = '';
  constructor(readonly reader: JourneyReader, readonly name: string, private readonly live = false,
    private readonly keys: JourneyKeys = reader) {}

  private async speech() {
    const phrases = [...await this.reader.spokenPhraseLog()];
    if (this.live) {
      const last = await this.reader.lastSpokenPhrase();
      if (last && last !== this.lastSeen) {
        this.lastSeen = last;
        if (phrases.at(-1) !== last) this.heardLive.push(last);
      }
      phrases.push(...this.heardLive);
    }
    return phrases;
  }

  async press(key: string) {
    await this.keys.press(key);
  }

  async type(text: string) {
    await this.keys.type(text);
  }

  async checkpoint(stage: string) {
    this.transcript.push({ stage: this.stage, phrases: await this.speech() });
    await this.reader.clearSpokenPhraseLog();
    this.heardLive = [];
    // Start each stage from what VoiceOver says next, not what it said last.
    if (this.live) this.lastSeen = await this.reader.lastSpokenPhrase();
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
      await this.press(key);
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
