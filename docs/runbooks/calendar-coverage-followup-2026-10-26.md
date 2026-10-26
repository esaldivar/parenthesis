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
  restores keyboard focus. Separate navigation covers occurrences in different months.
- Required accessibility states include save-error, recovered-toast and repeated-Month scans. Mobile scans
  must match their configured width. A controlled report negative proves desktop-width mobile evidence fails.
- The #259 regression now retains its configured viewport instead of overriding every profile to 1280/390.

## Local validation and release boundary

`npm run typecheck` passed. `node --test scripts/summary-policy.test.mjs` passed **8/8**.
Playwright discovery reports **234 executions in 15 files**, including **55 new profile executions**;
discovery is not a passing browser run. `git diff --check` passed.

Docker is unavailable locally, so these new scenarios have not run against an isolated candidate here.
The unchanged release-only workflow runs them after reviewed integration in a `release/*` → `develop` candidate.
Do not waive the gate, enable ordinary feature-PR browser runs, or relabel #315's historical result as this PR's.
No merge, deployment, paid testing service, production data, or issue acceptance is part of this follow-up.

Remaining acceptance includes real browser execution of this exact candidate, past/today/ambiguous-time and
continued/year-boundary cases, review of incomplete axe results, real VoiceOver/NVDA (#281), and physical
device checks. #278 and #279 stay open until their criteria are actually met.
