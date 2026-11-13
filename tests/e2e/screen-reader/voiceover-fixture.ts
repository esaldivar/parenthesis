import { voiceOverTest } from '@guidepup/playwright';
// Guidepup has no public API for this; the package has no exports map, so the module path is stable for 0.21.x.
import { applicationIdMap } from '@guidepup/playwright/lib/applicationIdMap';
import { navigateVoiceOverToWebContent } from '@guidepup/playwright/lib/navigateVoiceOverToWebContent';
import type { Family } from '../support/family';
import { withLocalFamily } from './local-family';
import { ReaderJourney } from './reader-journey';

/**
 * Real macOS VoiceOver (#443), in Playwright's Chromium or, where Playwright can't install it (macOS 13), the
 * installed Google Chrome (E2E_BROWSER_CHANNEL=chrome). Guidepup picks the app VoiceOver activates from the browser
 * name alone ("chromium" means Chrome for Testing), so a channel needs its own app id.
 */
export const voiceOverChannelTest = voiceOverTest.extend({
  voiceOverStartOptions: { capture: true },
  voiceOver: async ({ voiceOver, page }, use) => {
    const channel = process.env['E2E_BROWSER_CHANNEL'];
    if (channel) {
      const applicationId = (applicationIdMap as Record<string, string | undefined>)[channel];
      if (!applicationId) throw new Error(`VoiceOver can't activate browser channel ${channel}.`);
      voiceOver.navigateToWebContent = ({ capture } = {}) =>
        navigateVoiceOverToWebContent({ voiceOver, page, applicationId, capture });
    }
    await use(voiceOver);
  },
});

/** Full capture records everything VoiceOver says after each command; the journey also reads its last phrase. */
export const test = voiceOverChannelTest.extend<{ family: Family; reader: ReaderJourney }>({
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
