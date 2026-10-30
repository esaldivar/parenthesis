import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// The release gate (docs/runbooks/playwright-release-gate.md). It runs against a release candidate that is already
// running: in CI, the API image built from the release PR, with its own Postgres and Mailpit. The app only works over
// HTTPS (Secure, __Host- cookies), so the test instance uses a throwaway self-signed certificate.
const ci = !!process.env['CI'];

export default defineConfig({
  testDir: './specs',
  metadata: { testedSha: process.env['E2E_TESTED_SHA'] ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
  // Every test makes its own synthetic family, so tests don't share state and can run in parallel.
  fullyParallel: true,
  forbidOnly: ci,
  // One retry in CI, to tell a flaky test from a real failure. The summary lists anything that only passed on retry.
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  timeout: 30_000,
  // Leave time within the 60-minute CI job to emit reports and upload diagnostics.
  globalTimeout: ci ? 48 * 60_000 : undefined,
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
    // Fail an unreachable control promptly instead of consuming the whole scenario/job timeout.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  },
  // #278: retain the desktop baseline; run every M3 journey in custom touch emulation profiles.
  // These profiles do not certify physical devices.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // Local runs can point at an already-installed Chromium instead of downloading one.
        launchOptions: process.env['E2E_CHROMIUM_PATH'] ? { executablePath: process.env['E2E_CHROMIUM_PATH'] } : {},
      },
    },
    ...(['chromium', 'webkit'] as const).flatMap(browserName => [320, 390].map(width => ({
      name: `mobile-${browserName}-${width}`,
      testMatch: ['**/m3-calendar/**/*.spec.ts', '**/regression/issue-208-*.spec.ts', '**/regression/issue-259-*.spec.ts'],
      use: {
        ...devices[browserName === 'chromium' ? 'Pixel 7' : 'iPhone 13'],
        browserName,
        viewport: { width, height: 844 },
        screen: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        ...(browserName === 'chromium' && process.env['E2E_CHROMIUM_PATH']
          ? { launchOptions: { executablePath: process.env['E2E_CHROMIUM_PATH'] } } : {}),
      },
    }))),
  ],
});
