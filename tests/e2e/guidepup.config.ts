import { defineConfig, devices } from '@playwright/test';

// Separate opt-in configuration: never changes the required release Playwright gate.
// A real, interactive Windows/NVDA or macOS/VoiceOver session is mandatory.
export default defineConfig({
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
  },
  projects: [{
    name: 'screen-reader-desktop',
    use: { ...devices['Desktop Chrome'], headless: false },
  }],
});
