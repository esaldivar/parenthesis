import { expect, type Page } from '@playwright/test';
import type { VoiceOverPlaywright } from '@guidepup/playwright';
import { addHours } from '../support/data';
import type { ReaderJourney } from './reader-journey';

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The date picker's own cell label, e.g. "Friday, November 20, 2026". */
export const dayLabel = (monday: Date, offset: number) => addHours(monday, offset * 24).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

/** A typed en-US date, e.g. 11/20/2026. */
export const typedDate = (date: Date) => date.toLocaleDateString('en-US', {
  month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC',
});

/**
 * VoiceOver's own heading navigation (VO-Command-H), bounded, until it says this heading. VoiceOver's cursor may start
 * below the heading and doesn't wrap ("Last heading"), so the search turns back at either end.
 */
export async function findHeading(voiceOver: VoiceOverPlaywright, reader: ReaderJourney, name: RegExp) {
  await reader.checkpoint(`Heading ${name}`);
  let forward = true;
  for (let count = 0; count < 32; count++) {
    if (forward) await voiceOver.nextHeading();
    else await voiceOver.perform(voiceOver.keyboardCommands.findPreviousHeading);
    const spoken = (await voiceOver.spokenPhraseLog()).join(' ');
    if (/\bheading\b/i.test(spoken) && name.test(spoken)) return;
    if (forward && /\blast heading\b/i.test(spoken)) forward = false;
    else if (!forward && /\bfirst heading\b/i.test(spoken)) forward = true;
    await reader.checkpoint(`Heading ${name}, step ${count + 2}`);
  }
  throw new Error(`VoiceOver did not announce the heading ${name}`);
}

/** VoiceOver's cursor, bounded, until it reads text matching `name` (for content Tab doesn't reach). */
export async function readUntil(voiceOver: VoiceOverPlaywright, reader: ReaderJourney, name: RegExp,
  direction: 'next' | 'previous' = 'next', steps = 24) {
  await reader.checkpoint(`Read ${direction} to ${name}`);
  for (let count = 0; count < steps; count++) {
    await voiceOver[direction]();
    const spoken = (await voiceOver.spokenPhraseLog()).join(' ');
    if (name.test(spoken)) return;
    // Fail fast if VoiceOver's cursor has left the page for the browser's own toolbar.
    if (/\b(new tab button|tab search|leaving web content)\b/i.test(spoken)) {
      throw new Error(`VoiceOver left the web page before reading ${name}`);
    }
  }
  throw new Error(`VoiceOver did not read ${name}`);
}

/**
 * Chooses a day in the open Material date picker with real arrow keys, following its roving active cell
 * (never focusing a cell from the DOM), then Enter. VoiceOver must say the day it lands on.
 */
export async function pickDay(page: Page, reader: ReaderJourney, target: string) {
  const active = page.locator('mat-calendar .mat-calendar-body-active');
  await expect(active).toBeFocused();
  for (let step = 0; step < 40; step++) {
    const current = await active.getAttribute('aria-label');
    if (current === target) {
      await reader.heard(new RegExp(target.split(',')[1]!.trim(), 'i'));
      await reader.press('Enter');
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      return;
    }
    await reader.checkpoint(`Picker toward ${target}`);
    await reader.press(Date.parse(current!) < Date.parse(target) ? 'ArrowRight' : 'ArrowLeft');
    await expect(active).not.toHaveAttribute('aria-label', current!);
  }
  throw new Error(`Could not move the date picker to ${target}`);
}

/**
 * The polite success toast. VoiceOver should announce it on its own. On macOS 13 it didn't after an activity save,
 * which moves focus and changes the week heading at the same moment, so if it isn't heard the VoiceOver cursor reads
 * it instead and the transcript says so. That fallback proves the toast is readable, not that it was announced; the
 * announcement timing is tracked as an app issue (see the runbook's limits).
 */
export async function toastHeardOrRead(page: Page, voiceOver: VoiceOverPlaywright, reader: ReaderJourney, pattern: RegExp) {
  const toast = page.locator('app-toast-host .toast').filter({ hasText: pattern });
  await expect(toast).toBeVisible();
  // Pointing at a toast pauses its countdown (the host's hover hold), so it is still there if VoiceOver must read it.
  // Playwright's pointer events don't move VoiceOver's cursor.
  await toast.hover();
  if (await reader.heard(pattern, { describe: false }).then(() => true, () => false)) return;
  reader.note('[VoiceOver did not announce the notification; reading it with the VoiceOver cursor]');
  // Start VoiceOver's cursor at the toast itself: put keyboard focus on its Close button (the focus check is already
  // done), bring VoiceOver's cursor to it, then step back to the message. "Last item" from the page would leave the
  // web area for Chrome's toolbar.
  await toast.getByRole('button').focus();
  await voiceOver.perform(voiceOver.keyboardCommands.moveCursorToKeyboardFocus);
  await readUntil(voiceOver, reader, pattern, 'previous', 6);
}
