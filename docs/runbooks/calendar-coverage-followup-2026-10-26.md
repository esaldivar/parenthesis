# Calendar coverage follow-up — October 26, 2026

## Verified existing execution

Release PR #315's [Playwright run 40316038202](https://github.com/esaldivar/parenthesis/actions/runs/40316038202)
completed successfully. The browser job log records **179 passed executions**, followed by a successful
summary and Release E2E gate. The workflow used merge candidate
`92be9b9e962751f6e6fa3c273d6cb62836eae46e`; PR head `a3a82af0ae0cc846e6328ea8feb55a0aee058846`
is not substituted for that tested SHA. HTML report and summary artifacts were uploaded.

This supersedes the foundation's earlier unsupported-runner/no-green-run note. It does not cover the new
follow-up tests below, certify physical phones, or replace review of incomplete axe rules and real speech.

## New coverage awaiting browser execution

- Touch Edit/Swap: independent invalid/corrected date selections, associated error reasons, refused-submit
  focus, preserved End date and Cancel with no event/swap writes. Both themes, reduced motion, configured profiles.
- Home/Calendar: move the selected empty slot, clear with Escape and verify no event was created.
- Chicago spring/fall transitions: preserve local date/time fields and exact UTC instants after a title edit;
  elapsed duration is one hour in spring and three in fall. Nonexistent/ambiguous wall times are deliberately
  outside these cases and remain a separate acceptance gap.
- Controlled rendered overflow: the width assertion must reject a synthetic 200vw element and pass after
  restoration, with screenshots/profile evidence of both states. No application style is altered.
- Rendered save failure: a synthetic first PATCH response fails without changing the fixture; input and error
  focus remain usable; retry saves, produces a single polite status region without stealing focus, and does
  not replay the toast after reload.
- Actual repeating Month series: each occurrence names its own full date, opens details for that date and
  restores keyboard focus. Separate navigation covers December/January occurrences and names both years.
- Added stale-link recovery from yesterday to today with past picker cells disabled, plus both segments of an all-day Month span with full-range names and focus return.
- Required accessibility states include save-error, recovered-toast, repeated-Month and continued-Month scans. Mobile scans
  must match their configured width. A controlled report negative proves desktop-width mobile evidence fails.
- The #259 regression now retains its configured viewport instead of overriding every profile to 1280/390.

## Local validation and release boundary

`npm run typecheck` passed. `node --test scripts/summary-policy.test.mjs` passed **8/8**.
Playwright discovery reports **254 executions in 15 files**, including **75 new profile executions**;
discovery is not a passing browser run. `git diff --check` passed.

Docker is unavailable locally, so these new scenarios have not run against an isolated candidate here.
The unchanged release-only workflow runs them after reviewed integration in a `release/*` → `develop` candidate.
Do not waive the gate, enable ordinary feature-PR browser runs, or relabel #315's historical result as this PR's.
No merge, deployment, paid testing service, production data, or issue acceptance is part of this follow-up.

Remaining acceptance includes real browser execution of this exact candidate, ambiguous/nonexistent wall-time cases, review of incomplete axe results, real VoiceOver/NVDA (#281), and physical
device checks. #278 and #279 stay open until their criteria are actually met.


## PR #321 failure follow-up

Run `40436259376` on head `c9723de` built and started its isolated candidate, but was cancelled at the
30-minute job boundary. The list reporter recorded repeated failures in the touch Edit/Swap, slot clearing,
and spring/fall Edit scenarios in `mobile-recovery.spec.ts`. No final failure report or trace artifact was uploaded;
this limits root-cause certainty. The preceding run `40432859080` was cancelled while installing browsers, before tests.
Neither run is a browser pass.

The proposed correction uses accessible Start/End time labels instead of Angular binding-attribute selectors,
waits for loaded fields before capturing original values, and chooses slot targets from the rendered agenda/grid
rather than assuming a layout from hasTouch. It retains the same invalid-date, focus, no-write, UTC-duration and
API persistence assertions. Action/navigation timeouts are 10/30 seconds; a 24-minute CI global timeout leaves room
inside the unchanged 30-minute job for Playwright reports and artifact uploads. A global timeout remains a gate failure;
no test or browser profile is removed, skipped or waived.

Local validation: frontend lint, 605 tests, production build, E2E TypeScript and eight report-policy tests passed.
Discovery still contains 254 executions. Docker and .NET are unavailable here, so the revised scenarios need actual
release-candidate CI execution after reviewed integration. The palette review fixes and those test corrections are
one PR; deployment and full issue acceptance remain separate.
