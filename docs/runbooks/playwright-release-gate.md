# Playwright release gate

End-to-end tests that keep a release from breaking what already works (owner decision, October 18, 2026). They run
on work PRs into `release/*` and milestone release PRs, `release/x.y.z` → `develop`, and test the current milestone **and every milestone before
it**. A failure blocks the merge.

| | |
|---|---|
| Workflow | [`.github/workflows/playwright-release.yml`](../../.github/workflows/playwright-release.yml) |
| Tests | [`tests/e2e/`](../../tests/e2e/) (Playwright, desktop Chromium and mobile Chromium/WebKit) |
| Required check | **Release E2E gate**, on `release/*` and `develop` |
| Results | The run's summary page, the `playwright-report` artifact, and the Discord release notification |

## When it runs

| PR | Playwright |
|---|---|
| `release/0.2.0` → `develop` | **Runs** (opened, new pushes, reopened, edited/retargeted, marked ready for review) |
| `hotfix/*`, `chore/sync-*` → `develop` | No. The gate check passes at once. |
| Any same-repository work branch → `release/x.y.z` | **Runs** (same events as above) |
| `develop` → `main`, `hotfix/*` → `main` | No |
| Pushes to any branch, schedules | No |

`develop` only accepts release branches, hotfixes and `chore/sync-*` back-merges (see
[the development workflow](../development-workflow.md)), so all other work reaches it through a release PR and this
gate. Draft work and release PRs don't run it; their gate fails. Converting back to draft reruns the gate. Marking the PR ready for review starts the run. A fork PR in either gated path never runs it, and the gate fails for it.

## What it tests

The release candidate as it would land: the API image built from the PR (GitHub tests the PR merged with its target release branch or `develop`),
started with its own Postgres, Mailpit and Azurite (a local blob emulator for event photos) on the runner. Nothing touches the shared development environment, and no
secrets or production settings are used.

- **Data:** every test signs up its own synthetic parents (`…@example.test`) and family, so tests are independent
  and can run in parallel. Emails are read from Mailpit, like a real inbox.
- **Photos:** event photos go to Azurite, started by `start-release-candidate.sh`, with uploads turned on. Test
  photos are generated synthetic images, never real photos.
- **HTTPS:** the app's cookies are `Secure` and `__Host-`, so the instance uses a throwaway self-signed certificate.
- **Rate limits:** sign-in's limit is raised for the run (`Identity__AuthRateLimit__PermitLimit`). The child-PIN limit
  is fixed at 30 tries a minute per address. A full run uses about 11, or about 22 if every PIN test needs its
  retry, so keep the PIN tests lean.

Tests are grouped and tagged by milestone, following the release map in
[the backlog](../planning/mvp-backlog.md). [`milestones.json`](../../tests/e2e/milestones.json) lists every milestone
with tests, and the summary reports each one:

| Tag | Milestone | Folder |
|---|---|---|
| `@m1` | v0.1.0 Foundation: health, the app shell, authentication required, antiforgery | `specs/m1-foundation/` |
| `@m2` | v0.2.0 Accounts and profiles: sign-up, email confirmation, sign-in, families, tenant isolation, invitations, children approved by both parents, profile picker, PINs, lockout | `specs/m2-accounts/` |
| `@m3` | v0.3.0 Calendar and approvals (the work already in `develop`): proposals, approvals, rejections, private notes, what children see | `specs/m3-calendar/` |
| `@regression` | One test per fixed bug, named after its issue (`issue-58-…`), plus its milestone tag | `specs/regression/` |

Features without screens yet are tested through the API, the same way the app will call them. When a screen ships,
add a browser journey for it. Screens that aren't built yet are tested for their honest "not available yet" state.

### Rules for the suite
- **Never remove coverage** for a released milestone. The summary fails the gate if a milestone in `milestones.json`
  has no tests, or if a test has no milestone tag.
- Change a test only when the app's behaviour changed on purpose, in the same PR as that change.
- Every bug fix adds a regression test in `specs/regression/`.
- When a new milestone starts shipping, add it to `milestones.json` and give it a folder.
- Never skip, disable or delete a failing test to get a release through.

## When it fails
1. The merge is blocked: **Release E2E gate** is red.
2. The run's summary lists the failed tests and the results per milestone.
3. Download `playwright-failures` for screenshots, traces (open them with `npm run trace -- <file>` in `tests/e2e`) and the API
   log. `playwright-report` has the full HTML report.
4. Fix the underlying problem on the release branch (a `fix/*` PR into `release/*`, or a push to it).
5. The new push re-runs the gate and cancels any run it supersedes.

A test that fails and then passes on its one retry is reported as **flaky**. The gate still passes, but fix the test
before the next release.

## Branch protection (owner, in GitHub settings)
On `develop` and the `release/*` ruleset, under **Settings → Branches** (or the ruleset that protects it):
1. Add **Release E2E gate** to the required status checks. Keep the existing ones (Backend, Frontend, API image,
   PR source).
2. Don't add **Playwright (release candidate)** as a required check. On other PRs into `develop` that job is skipped, and GitHub
   counts a skipped required check as passed. The gate job always runs and checks the real result.
3. **Approval:** GitHub doesn't let you approve your own PR, so no approval rule is added. **The owner merging the
   release PR is the approval.** Nobody else merges `release/*` into `develop`.

PR retargeting triggers a fresh run via `edited`. If a gated PR has no **Release E2E gate** check, reopen it or push a commit. Require branches to be up to date before merging. Keep existing checks; the owner configures settings separately.

## Running it locally
You need the app running over HTTPS with Postgres and Mailpit. The CI script does this from a built image:

```bash
docker compose up -d postgres mailpit           # or any Postgres and Mailpit on the default ports
docker build -f docker/api.Dockerfile -t parenthesis-api:rc .
POSTGRES_CONNECTION="Host=localhost;Port=5432;Database=coparent;Username=<user>;Password=<password>" \
  tests/e2e/scripts/start-release-candidate.sh parenthesis-api:rc
cd tests/e2e && npm ci --ignore-scripts && npm run browser:install
npm test                                         # or: npm test -- --grep @m2
node scripts/summarize.mjs                       # the same summary CI shows
```

Use a throwaway database: the tests create accounts and families. Stop the API afterwards with `docker rm -f api`.

## Cost and time
The repository is public, so GitHub-hosted runners cost nothing. The earlier desktop-only baseline took about 8–10 minutes: building the
image (cached between runs), installing Chromium (cached), about 20 seconds of tests, and uploads. It runs on work PRs into release branches and release promotions, and a new push cancels the run it replaces. The five-profile matrix (desktop plus four mobile profiles) took about 10 minutes for the whole job on release PR #362 (run 40868443190): 7.8 minutes of tests for 259 executions on 2 workers. The job timeout is 60 minutes and Playwright's global timeout 48 (#324), which leaves room for diagnostics and uploads after a slow or failing run.

## Discord
The `notify` job remains limited to release/* → develop promotions and posts the result to the existing Parenthesis Discord webhook, read from the `DISCORD_WEBHOOK_URL`
secret. The post has the headline, the branch and PR number, test counts per milestone, and links to the PR and the
run. Mentions are turned off. The job runs no PR code: it only reads the summary file. If the secret is missing or
Discord is down, the job logs a warning and the gate result stands.

## M3 mobile emulation (#278)

The desktop `chromium` project retains all M1/M2/M3 and regression coverage. Four additional custom projects run M3
browser/API journeys and the M3 regressions #208/#259: `mobile-chromium-320`, `mobile-chromium-390`,
`mobile-webkit-320`, `mobile-webkit-390`, all 844px high with `isMobile`/`hasTouch` enabled. Mobile acceptance uses
`Locator.tap()`; this tests touch-capable browser behavior, not just a desktop resize. These are custom profiles,
not actual named devices. WebKit is not proof of iPhone Safari. Physical phone checks remain manual (#280 cancelled).
No paid testing service is used. See [Playwright emulation](https://playwright.dev/docs/emulation).

Existing inline desktop/390px loops now run once at the configured project size, so a 320px profile cannot silently
switch itself to 390px. Context locale/time zone are en-US/America/Chicago, matching the synthetic family. Each test
creates isolated parents using the local Mailpit API, never an owner inbox, and disposes its sessions. The entire
throwaway database/mailbox is discarded with the runner. Most tests use next-week dates. `mobile-recovery.spec.ts` additionally seeds next year’s Chicago spring/fall
transitions and verifies local fields and persisted UTC duration after an edit. It also types the transition times
themselves on the Edit form: a fall-back 1:30 AM (which happens twice) saves the first occurrence, and a spring-forward
2:30 AM (which doesn't exist) saves 3:30 AM, as `fromFamilyLocal` documents. Other time zones and real-device date
input still need separate acceptance.

```bash
cd tests/e2e
npm ci --ignore-scripts
npm run browser:install                           # Chromium + WebKit and system libraries
npm run typecheck
npm test -- --grep @mobile --project=mobile-webkit-320 --workers=1
npm test                                         # full release matrix; required before promotion
node scripts/summarize.mjs                        # full-matrix policy, not for a targeted-only report
node --test scripts/summary-policy.test.mjs       # includes controlled missing-WebKit/failed/skipped negatives
```

Run against the isolated HTTPS app/Postgres/Mailpit described above. Targeted reports intentionally fail the full
release summary's missing-coverage checks; inspect the targeted Playwright exit status and HTML report instead.
`E2E_TESTED_SHA` identifies the actual candidate; CI supplies `github.sha` (the merge candidate), not the branch's
older head. CI also records run start time; stale SHA/timestamps, missing profiles, skipped tests and global runner
errors cannot certify a release. Summary fields retain Discord compatibility, but distinguish unique scenarios
from profile executions and list each profile. Ordinary PR CI typechecks/discovers the suite and tests report
policy; the separate browser workflow executes the full matrix on PRs into release/* and release/* → develop.

Each new mobile state attaches a full screenshot and JSON containing SHA/profile/browser/dimensions/touch flag and
family time zone. HTML reports include these on success; failure screenshots/traces/API logs remain available.
Link a run/report and the precise state/profile to an issue. Diagnose product defects with a focused regression;
do not skip/exclude them to make infrastructure green. Use only synthetic attachments. Both light/dark reduced-
motion states are explicit. The 200% text scenario changes root text size and asserts measured text growth, reflow
and reachable actions; device scale factor or a narrow viewport alone would not establish text enlargement.

### Coverage map and honest remaining gaps

| Issue | Named coverage | Remaining acceptance |
|---|---|---|
| #173 | `date recovery and reminder touch selection…`; existing Home reminder/task and API tests | Reminder recurrence/selection matrix and physical phone/SR |
| #226 | existing `saving shows a toast…`; new reminder toast geometry and Close | Toast focus/announcement behavior in #279/#281, actual phone |
| #232 | existing `dates are picked…` now follows #248/#249 and every profile | Device calendar/keyboard behavior; no old range-picker expectation |
| #236 | component format-description tests; reminder field rendered by new journey | E2E reason/format associations in #279 and actual speech #281 |
| #237 | existing `tapping empty time…` Calendar/Home two-tap journey | `moving and clearing a slot…` covers Home/Calendar and Escape; real mobile screen-reader path remains |
| #248/#249 | `date recovery and reminder touch selection…`; existing date journey; `touch Edit and Swap…` (both themes); Chicago spring/fall edit boundaries; `typing a nonexistent/ambiguous Chicago … time…`; past/today stale-link recovery | Device date input and other time zones |
| #250 | existing Month continuation/details journey; `Month pending overflow…` geometry/reachability | Broader dense/repeated/year-boundary mobile matrix and actual spoken dates |
| Text/reflow | `200% text enlarges content…` | OS text scaling, pinch zoom, magnification and clipping with longer localized content |

### Evidence (October 29, 2026)

**Full release gate.** Release PR #362's run
[40868443190](https://github.com/esaldivar/parenthesis/actions/runs/40868443190) passed **259/259 executions** on merge
candidate `9052a9bff30d17d696f24f6824ca861ec0a94d71`: desktop `chromium` 71, and 47 in each of `mobile-chromium-320`,
`mobile-chromium-390`, `mobile-webkit-320` and `mobile-webkit-390`. Each mobile profile ran the 9 recovery and 4
acceptance scenarios added after #315, so the October 26 additions are now browser-verified. (Earlier history: #315's
run [40316038202](https://github.com/esaldivar/parenthesis/actions/runs/40316038202), 179 passes; see the
[follow-up evidence record](calendar-coverage-followup-2026-10-26.md).)

**Controlled product negatives.** Beyond the synthetic-page overflow control in `mobile-recovery.spec.ts`, two
deliberate product bugs were built into the app and run locally on `mobile-chromium-320` and `mobile-chromium-390`
(never committed):

| Deliberate bug | Caught by | Result |
|---|---|---|
| Toasts forced to 600px wide | `date recovery and reminder touch selection…` (light and dark), toast geometry | 4 failures: right edge 616px vs ≤321/≤391 |
| A nonexistent 2:30 AM moved back to 1:30 AM CST instead of forward | `typing a nonexistent Chicago spring forward time…` | 2 failures: saved `07:30Z`, expected `08:30Z` |

Exactly those 6 executions failed and the other 24 passed. With the code restored, the full suite passed
**171/171** locally on `chromium`, `mobile-chromium-320` and `mobile-chromium-390` (73 + 49 + 49). Two caveats. A
`min-width` change alone didn't break the toast, because a later `min-width: 0` in the same rule wins: that's CSS, not a
test gap. And WebKit couldn't be downloaded in the agent sandbox, so this negative covers Chromium only. The CI-level
red-gate check stays open under #341.

**Running it without Docker image builds (agent sandboxes).** Publish the API (`dotnet publish`), copy the built SPA
into its `wwwroot`, run `migrate`, then start it with the HTTPS/SMTP settings from `scripts/start-release-candidate.sh`
against local Postgres and Mailpit. Point Playwright at a preinstalled Chromium with `E2E_CHROMIUM_PATH` when the browser
download is blocked:

```bash
E2E_BASE_URL=https://localhost:8443 MAILPIT_URL=http://localhost:8025 E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  npx playwright test --project=chromium --project=mobile-chromium-320 --project=mobile-chromium-390
```

No physical-device or real-screen-reader certification is implied by any of these runs.

## Rendered accessibility acceptance (#279)

`support/accessibility.ts` reuses axe-core, already used by frontend component tests. Component checks in
`src/frontend/src/testing/axe.ts` run under jsdom with contrast disabled and may exclude lingering simulated
overlays. The end-to-end helper instead audits the whole rendered page, including open overlays, with contrast
enabled and no exclusions. It selects WCAG 2.0 A/AA, 2.1 A/AA, 2.2 AA and best-practice tags. See
[axe's API and tag reference](https://www.deque.com/axe/core-documentation/api-documentation/).

`specs/m3-calendar/accessibility.spec.ts` reuses the isolated two-parent family fixture and all five existing
profiles, in both themes. `a11y-states.json` lists required states. Each scan attaches rule IDs, sanitized selectors,
manual-review results, axe version, timestamp, state, profile, viewport and tested SHA. HTML/value/failure-summary
fields are omitted. Playwright's existing HTML/artifact uploads retain these JSON attachments. Use synthetic
fixtures only; do not point this suite at production or an owner's mailbox.

| Requirements | Automated scenarios |
|---|---|
| #213, #250 | Week/Month/List, keyboard details entry and return; Month occurrence date in accessible name |
| #206, #232, #248, #249 | Add/Edit/Swap, open picker, invalid and corrected dates; independent date choices, reason association, refused-submit focus |
| #173, #236 | Reminder/Task cards and selected state; Reminder typed-date format description |
| #172, #176 | Reminder/Task confirmation entry, Keep it return, successful final deletion and surviving Calendar focus |
| #226 | Active toast scan, polite live region and no focus inside toast after save |
| Approvals/privacy | Pending/declined/other-parent unavailable fixtures; private-note sentinel absent from rendered parent page; Approvals scan |
| #237 | Existing two-tap empty-slot browser journey remains; no replacement or additional acceptance claim |

The release summary requires every listed state in both themes for every required profile, with nonempty rule
execution, matching SHA/profile, fresh capture time and zero violations. Missing/invalid/failed scan attachments
cannot count as green. The main CI workflow continues typechecking/discovery/report-policy checks; the separate browser workflow
runs on work PRs into release/* and release/* → develop. No baseline or automatic waiver is added.

```bash
cd tests/e2e
npm run typecheck
node --test scripts/summary-policy.test.mjs
npm test -- accessibility.spec.ts --project=chromium --workers=1
npm test -- --grep 'controlled scanner regression' --project=chromium
```

The controlled scanner scenario deliberately renders an unlabeled input, asserts axe reports `label`, restores
its name and asserts zero violations. This proves the scanner detects that defect in a browser, not that the
application passes. The report-policy tests separately prove missing, malformed, stale, empty and violating
evidence fails the gate. Targeted runs cannot satisfy the full-matrix release summary.

### Human and screen-reader checks still required

Review every `incomplete` rule result manually. Axe cannot prove absent/hidden intended content is reachable,
meaningful reading order, correct or single speech announcements, usable zoom/magnification, physical touch,
all contrast combinations or complete WCAG conformance. Keyboard focus assertions supplement scans; an ARIA
pass does not establish actual speech. #281 must provide real VoiceOver/NVDA transcripts; iOS VoiceOver and
Android TalkBack remain explicit manual checks. Toast focus after navigation does not prove focus preservation
for every in-place completion/update; error recovery, continued/repeating Month date speech and retained-session
failure paths require their focused regressions and acceptance evidence. Do not automatically accept linked issues.

Local execution on October 25, 2026 against isolated application base `5269d52` reached all 54 desktop state scans
in both themes. The controlled scanner scenario passed. All four application journeys failed on
`label-content-name-mismatch`: account button, pending Month bar and open Material month/year picker button.
Keyboard focus/date/deletion assertions completed successfully. This is detected product failure evidence,
not a passing accessibility matrix. Keep the implementation draft until those findings and remaining profile
evidence are resolved. No scanner rule, element or overlay is excluded.

Follow-up product repairs are in #302. The targeted desktop light-theme journeys and controlled scanner scenario
pass (3/3) against the repaired image. Tests navigate Material's roving active date with arrow keys before Enter;
programmatically focusing an otherwise untabbable cell does not establish normal keyboard operation. The full
repaired profile/theme matrix is still required; do not infer it from this targeted result.

The later full repaired run finished **13 passed / 12 failed**. Diagnostics reproduced a fast Swap selection
during Material's opening animation: the value changes, but Material ignores `close()` while animating. The
follow-up completes closing after the opening animation ends, retaining the standard focus restoration. Month
overflow buttons also need a 24px minimum width (one WebKit measurement was 22.3px).

Mobile diagnostics tied the remaining apparent obscuration/contrast failures to the sticky bottom navigation.
The same dark 320px Home/Edit/Swap/Approvals scans passed after normal page scrolling without changing styles,
rules or exclusions. This matches [axe's open sticky spatial-grid limitation](https://github.com/dequelabs/axe-core/issues/3720).
Scans now use a deterministic document-end position where the sticky footer occupies its normal flow position;
`auditScroll` records that position. Axe still audits the entire rendered document and every open overlay.
This does not establish that every focused control is unobscured at every scroll position: retain keyboard,
physical touch and manual sticky-navigation checks. The initial failures remain failure evidence, not waivers.

## Earlier-gate rollout (#341)

This extends the October 18 release-only policy with the owner's October 28 decision. Merge the workflow change
into the active release branch, then use the existing promotion flow to carry it into develop. No default-branch
policy workflow or deployment change is required for this `pull_request` workflow.

The owner adds **Release E2E gate** as a required check on `release/*`, retaining the existing develop requirement
and up-to-date-branch rule. Run `node --test .github/scripts/playwright-gate.test.mjs` for controlled policy
negatives. A real passing full-matrix PR run is still required; local policy tests do not establish browser success.
Confirm a controlled failing browser assertion blocks the gate, then restore it and rerun before relying on rollout.
