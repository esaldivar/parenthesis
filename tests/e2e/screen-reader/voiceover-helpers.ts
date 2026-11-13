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
export async function readUntil(voiceOver: VoiceOverPlaywright, reader: ReaderJourney, name: RegExp, direction: 'next' | 'previous' = 'next') {
  await reader.checkpoint(`Read ${direction} to ${name}`);
  for (let count = 0; count < 24; count++) {
    await voiceOver[direction]();
    if (name.test((await voiceOver.spokenPhraseLog()).join(' '))) return;
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
