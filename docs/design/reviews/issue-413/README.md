# Issue #413 — loading feedback follow-up

November 4, 2026. Based on release/0.3.0 at `81cc990`; screenshots show the local frontend with this follow-up applied. Synthetic families only.

## Changes

- Event photo uploads use the same persistent status region for loading and the final success/partial-failure result. Byte progress remains outside the live region.
- A rate-limited profile upload preserves its explicitly unsaved preview and offers Try again, like connection and server failures.
- Starting another profile photo operation clears the previous preview/success announcement so it cannot replay after a failure. The error is announced through its existing alert.

## Verification

- Frontend: lint passed; 808 tests in 62 files passed; production build completed with the pre-existing `week-calendar.scss` warning (11.03 kB against a 10 kB warning budget). The zero-warning definition of done is therefore not established.
- Browser test TypeScript check passed.
- Desktop Chrome: four scenarios passed (light/dark × normal/reduced motion) at 1280 × 800.
- Chromium and WebKit phone emulation at 320 × 844 and 390 × 844: all 16 scenarios passed across runs. The initial mobile run passed 14, timed out creating a synthetic family for one 390px WebKit dark case, and left the final case unrun. A focused rerun passed both remaining cases. Together with desktop, all 20 scenario/profile combinations passed; this was not one uninterrupted green matrix run.
- The browser scenarios hold a calendar save, check status/animation/layout and a second submit, fail it, preserve the title, retry and check the success notice. They also hold a profile upload, verify indeterminate feedback, return 429, retain the preview and retry to a controlled successful response. Whole-document axe scans run during save and upload.
- Unit tests additionally cover measured/unknown event upload progress and the same status element surviving partial failure and retry, plus profile upload failures with status 0, 429 and 503.

Local setup: branch frontend served over HTTPS on port 4443, proxying calendar/auth requests to the existing local test API on 8443. That API predates photo support. Upload responses are controlled by Playwright; this is frontend evidence, not storage or deployment verification. CI must run the complete release gate against its own current merge candidate.

Run the focused browser suite from `tests/e2e` with `E2E_BASE_URL` pointing at the candidate:

```powershell
npx playwright test specs/m3-calendar/loading-feedback.spec.ts --workers 1
```

Each run attaches screenshots, viewport metadata and axe reports to the Playwright HTML report. The checked-in screenshots below are representative save states; they do not prove motion or spoken output.

- [Desktop light, motion enabled](light-false-saving-screen.png)
- [Desktop dark, reduced motion](dark-true-saving-screen.png)
- [320px Chromium light, motion enabled](mobile-320-light-false-saving-screen.png)
- [320px Chromium dark, reduced motion](mobile-320-dark-true-saving-screen.png)

## Still required before issue acceptance

- Test the deployed development candidate with real profile/event uploads, failures and retry. Confirm persistence, success/failure announcements and no duplicate submissions.
- Listen with actual NVDA and VoiceOver: loading once, no repeated animation/progress announcements, result/error spoken, retry usable and focus preserved. In particular, verify event batch completion/partial failure through the persistent status region.
- Physical phone and desktop review in both themes, with reduced motion and enlarged text.
- Owner acceptance after release promotion. Keep #413 open until that acceptance is recorded.
