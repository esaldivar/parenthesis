import { nvdaTest } from '@guidepup/playwright';
import type { Family } from '../support/family';
import { withLocalFamily } from './local-family';
import { ReaderJourney } from './reader-journey';

export { ReaderJourney } from './reader-journey';

export const test = nvdaTest.extend<{ family: Family; reader: ReaderJourney }>({
  nvdaStartOptions: { capture: true },
  family: async ({ context, baseURL }, use) => withLocalFamily(context, baseURL, use),
  reader: async ({ nvda }, use, info) => {
    const reader = new ReaderJourney(nvda, 'NVDA');
    try {
      await use(reader);
    } finally {
      await info.attach('nvda-app-speech', { body: await reader.attach(), contentType: 'application/json' });
    }
  },
});
