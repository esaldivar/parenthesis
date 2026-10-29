# Real screen-reader pilot (issue #281)

This is an **opt-in experimental test**, not part of the required release gate. The first spec uses a deterministic, synthetic HTML fixture to establish whether the host can actually capture screen-reader announcements; it is **not** Calendar acceptance evidence.

## Prerequisites

Use a machine with an **interactive graphical desktop** and a supported real screen reader: Windows/NVDA or macOS/VoiceOver. The normal headless Linux Playwright release runner is not an acceptable substitute.

From `tests/e2e`, install the peer dependencies and matching screen-reader assets:

```sh
npm install --save-dev @guidepup/playwright @guidepup/guidepup
npx @guidepup/setup setup
npx @guidepup/setup install
npx playwright install chromium
npx playwright test --config=guidepup.config.ts
```

The Guidepup dependencies and lockfile are intentionally **not yet committed**; installation must be verified and pinned on a real supported host before promoting the pilot beyond draft status. Do not treat an unexecuted spec as a passing test.

## Verification

- Record OS, browser, NVDA/VoiceOver, Guidepup versions and test commit SHA.
- Confirm the test fails if the expected heading text is changed without changing the assertion.
- Attach sanitized results to #281. Never capture production user data.
- Only then replace the synthetic page with the existing authenticated Calendar synthetic-family fixture, covering Add Event, validation, and focus/announcements.
- Keep the required Playwright release gate unchanged until repeated supported-host runs pass and the owner approves promotion.

Guidepup API: https://github.com/guidepup/guidepup-playwright
