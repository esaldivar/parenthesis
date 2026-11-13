import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Browser } from '@playwright/test';
import { MacOSKeyCodes } from '@guidepup/guidepup';
import { voiceOverTest } from '@guidepup/playwright';
// Guidepup has no public API for this; the package has no exports map, so the module path is stable for 0.21.x.
import { applicationIdMap } from '@guidepup/playwright/lib/applicationIdMap.js';
import { navigateVoiceOverToWebContent } from '@guidepup/playwright/lib/navigateVoiceOverToWebContent.js';
// The client's lastSpokenPhrase() only repeats its own log; this one asks VoiceOver ("content of last phrase").
import { lastSpokenPhrase as voiceOverLastPhrase } from '@guidepup/guidepup/lib/macOS/VoiceOver/lastSpokenPhrase.js';
import type { Family } from '../support/family';
import { withLocalFamily } from './local-family';
import { ReaderJourney, type JourneyKeys, type JourneyReader } from './reader-journey';

/**
 * Real macOS VoiceOver (#443), in Playwright's Chromium or, where Playwright can't install it (macOS 13), the
 * installed Google Chrome (E2E_BROWSER_CHANNEL=chrome). Guidepup picks the app VoiceOver activates from the browser
 * name alone ("chromium" means Chrome for Testing), so a channel needs its own app id.
 */
export const voiceOverChannelTest = voiceOverTest.extend({
  voiceOverStartOptions: { capture: true },
  voiceOver: async ({ voiceOver, page }, use) => {
    if (process.env['E2E_BROWSER_CHANNEL']) {
      const applicationId = browserApplicationId('');
      voiceOver.navigateToWebContent = ({ capture } = {}) =>
        navigateVoiceOverToWebContent({ voiceOver, page, applicationId, capture });
    }
    await use(voiceOver);
  },
});

const execFileAsync = promisify(execFile);

/** The browser app VoiceOver and the keys target: the channel's app (installed Chrome) or Chrome for Testing. */
export function browserApplicationId(browserName: string): string {
  const name = process.env['E2E_BROWSER_CHANNEL'] || browserName;
  const applicationId = (applicationIdMap as Record<string, string | undefined>)[name];
  if (!applicationId) throw new Error(`VoiceOver can't activate browser ${name}.`);
  return applicationId;
}

const modifierNames: Record<string, string> = {
  Shift: 'shift down', Command: 'command down', Meta: 'command down', Control: 'control down',
  Option: 'option down', Alt: 'option down',
};

const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** One System Events command for a Playwright-style key ("Shift+Tab", "Command+a", "Enter", "ArrowDown"). */
export function keyScript(name: string): string {
  const parts = name.split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts.map(part => {
    const modifier = modifierNames[part];
    if (!modifier) throw new Error(`Unknown modifier ${part} in ${name}.`);
    return modifier;
  });
  const code = (MacOSKeyCodes as unknown as Record<string, number | undefined>)[key];
  const command = key.length === 1 ? `keystroke ${quote(key)}` : code === undefined ? undefined : `key code ${code}`;
  if (!command) throw new Error(`Unknown key ${key}.`);
  return modifiers.length ? `${command} using {${modifiers.join(', ')}}` : command;
}

async function systemEvents(pid: number, command: string) {
  // Bring the test's own browser process forward by process ID, not by app ID: the person's everyday Chrome has the
  // same app ID. Always, because after Guidepup activates VoiceOver, System Events still reports the browser as
  // frontmost while keys don't reach it; the short delay lets the switch settle before the key.
  const script = [
    'tell application "System Events"',
    `set frontmost of (first process whose unix id is ${pid}) to true`,
    'delay 0.5',
    command,
    'end tell',
  ];
  await execFileAsync('osascript', script.flatMap(line => ['-e', line]), { timeout: 15_000 });
}

/** The process ID of the Chromium Playwright launched for this test, from the browser itself (DevTools protocol). */
export async function browserPid(browser: Browser): Promise<number> {
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo') as { processInfo: { type: string; id: number }[] };
    const pid = processInfo.find(info => info.type === 'browser')?.id;
    if (!pid) throw new Error('VoiceOver keys need the launched browser process ID.');
    return pid;
  } finally {
    await session.detach();
  }
}

/**
 * Keys go to the test's browser window as real macOS key events (System Events), the way a person's keyboard does,
 * so VoiceOver follows and announces the focus changes they cause. Keys Guidepup sends through the VoiceOver process
 * didn't reach the page on macOS 13, and Playwright's page keys (CDP) move focus without VoiceOver speaking it.
 */
export function osKeys(pid: number): JourneyKeys {
  return {
    press: async name => { await systemEvents(pid, keyScript(name)); },
    type: async text => {
      for (const line of text.split('\n')) {
        if (line) await systemEvents(pid, `keystroke ${quote(line)}`);
      }
    },
  };
}

/**
 * VoiceOver as a journey reader whose last phrase is what VoiceOver itself last said. Guidepup's log only holds
 * speech after its own commands, so speech caused by a real key (focus moves, live regions) is read from VoiceOver.
 */
export function liveVoiceOver(voiceOver: JourneyReader): JourneyReader {
  return {
    press: key => voiceOver.press(key),
    type: text => voiceOver.type(text),
    spokenPhraseLog: () => voiceOver.spokenPhraseLog(),
    clearSpokenPhraseLog: () => voiceOver.clearSpokenPhraseLog(),
    lastSpokenPhrase: () => voiceOverLastPhrase(),
  };
}

/** Full capture records everything VoiceOver says after each command; the journey also reads its last phrase. */
export const test = voiceOverChannelTest.extend<{ family: Family; reader: ReaderJourney }>({
  family: async ({ context, baseURL }, use) => withLocalFamily(context, baseURL, use),
  reader: async ({ voiceOver, browser }, use, info) => {
    const reader = new ReaderJourney(liveVoiceOver(voiceOver), 'VoiceOver', true, osKeys(await browserPid(browser)));
    try {
      await use(reader);
    } finally {
      await info.attach('voiceover-app-speech', { body: await reader.attach(), contentType: 'application/json' });
    }
  },
});
