import { voiceOverTest } from '@guidepup/playwright';
import type { Family } from '../support/family';
import { withLocalFamily } from './local-family';
import { ReaderJourney } from './reader-journey';

/**
 * Real macOS VoiceOver (#443). Full capture records everything VoiceOver says after each command; the journey also
 * reads its current last phrase, so a polite announcement that arrives after the keystroke still counts.
 */
export const test = voiceOverTest.extend<{ family: Family; reader: ReaderJourney }>({
  voiceOverStartOptions: { capture: true },
  family: async ({ context, baseURL }, use) => withLocalFamily(context, baseURL, use),
  reader: async ({ voiceOver }, use, info) => {
    const reader = new ReaderJourney(voiceOver, 'VoiceOver', true);
    try {
      await use(reader);
    } finally {
      await info.attach('voiceover-app-speech', { body: await reader.attach(), contentType: 'application/json' });
    }
  },
});
