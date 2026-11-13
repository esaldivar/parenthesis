# Guidepup real-screen-reader pilot — #281

This pilot extends the existing Playwright release suite; it does not replace axe-core, keyboard tests, mobile emulation, or owner testing.

## Initial integration boundary

- Reuse the isolated HTTPS release candidate, synthetic families, Postgres, and Mailpit from [the release-gate runbook](playwright-release-gate.md).
- Keep the current required **Release E2E gate** unchanged while real screen-reader automation is being proven. A missing GUI/screen reader must be reported as **blocked**, never as a passing test.
- Run Guidepup in a separate, opt-in, serial GUI job. Never share one screen-reader session across parallel Playwright workers.
- Windows: NVDA with a compatible interactive desktop. macOS: VoiceOver with the required accessibility permissions and an interactive GUI. Validate runner compatibility before adding either to CI. A headless GitHub runner is not proof of real-screen-reader coverage.
- Pin Guidepup versions after compatibility verification and record OS, browser, screen-reader, Guidepup versions and exact candidate SHA for every run.
- Store only sanitized announcement transcripts, screenshots, and diagnostic artifacts. Never include real family names, authentication tokens, private notes, or child records.

## Pilot scenario

1. Create a synthetic family using existing E2E fixtures and navigate to Calendar.
2. Start the real screen reader, move to the Calendar heading and Add Event control, and assert their meaningful spoken names.
3. Open Add Event, verify dialog/form identification and keyboard reachability.
4. Submit invalid input and verify the error is announced and focus remains usable.
5. Correct the input, save, verify a single success announcement without focus theft, and return to Calendar.
6. Close the screen-reader session in a finally/teardown path, even on failure.
7. Record a controlled negative regression to prove the test fails when an accessible name or announcement disappears.

## Rollout

1. Prove a single local Windows/NVDA execution, with reproducible logs.
2. Prove a macOS/VoiceOver execution; do not substitute a virtual reader.
3. Add dedicated, non-required opt-in CI jobs only where a supported GUI environment is available.
4. Map verified assertions to #279, #281, and relevant M3 product issues; keep issue-specific manual checks open until actually verified.
5. Propose a required gate only after stable, repeatable runs and owner approval.

## Outstanding prerequisites

- Verify Guidepup package/API and host compatibility before writing tests that claim real speech.
- Identify a suitable interactive Windows/macOS runner; no paid service or new recurring spend is authorized.
- Reuse existing fixtures and report conventions rather than introducing a second independent suite.
- Actual iPhone VoiceOver and Android TalkBack remain manual device coverage.
