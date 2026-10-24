import { defineConfig, devices } from '@playwright/test';

// The release gate (docs/runbooks/playwright-release-gate.md). It runs against a release candidate that is already
// running: in CI, the API image built from the release PR, with its own Postgres and Mailpit. The app only works over
// HTTPS (Secure, __Host- cookies), so the test instance uses a throwaway self-signed certificate.
const ci = !!process.env['CI'];

export default defineConfig({
  testDir: './specs',
  // Every test makes its own synthetic family, so tests don't share state and can run in parallel.
  fullyParallel: true,
  forbidOnly: ci,
  // One retry in CI, to tell a flaky test from a real failure. The summary lists anything that only passed on retry.
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'results/results.json' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'https://localhost:8443',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // Chromium is the baseline. Other browsers are added only when the supported platforms call for them.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Local runs can point at an already-installed Chromium instead of downloading one.
        launchOptions: process.env['E2E_CHROMIUM_PATH'] ? { executablePath: process.env['E2E_CHROMIUM_PATH'] } : {},
      },
    },
  ],
});
