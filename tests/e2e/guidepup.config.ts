import { devices } from '@playwright/test';
import { withGuidepup } from '@guidepup/playwright';
import { headSha } from './scripts/head-sha.mjs';

// Separate opt-in configuration: never changes the required release Playwright gate.
// A real, interactive Windows/NVDA or macOS/VoiceOver session is mandatory.
export default withGuidepup({
  metadata: { testedSha: headSha() },
  testDir: './screen-reader',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'guidepup-report' }]],
  outputDir: 'guidepup-results',
  use: {
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    baseURL: process.env['E2E_BASE_URL'] ?? 'https://localhost:8443',
    ignoreHTTPSErrors: true,
    timezoneId: 'America/Chicago',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [{
    name: 'screen-reader-desktop',
    testMatch: '**/real-reader-smoke.spec.ts',
    use: { ...devices['Desktop Chrome'], headless: false },
  }, {
    name: 'screen-reader-app-nvda',
    testMatch: '**/*-nvda.spec.ts',
    timeout: 300_000,
    use: { ...devices['Desktop Chrome'], headless: false },
  }],
});
