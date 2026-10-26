# Playwright release gate

End-to-end tests that keep a release from breaking what already works (owner decision, October 18, 2026). They run
only on milestone release PRs, `release/x.y.z` → `develop`, and test the current milestone **and every milestone before
it**. A failure blocks the merge.

| | |
|---|---|
| Workflow | [`.github/workflows/playwright-release.yml`](../../.github/workflows/playwright-release.yml) |
| Tests | [`tests/e2e/`](../../tests/e2e/) (Playwright, desktop Chromium and mobile Chromium/WebKit) |
| Required check | **Release E2E gate**, on `develop` |
| Results | The run's summary page, the `playwright-report` artifact, and the Discord release notification |

## When it runs

| PR | Playwright |
|---|---|
| `release/0.2.0` → `develop` | **Runs** (opened, new pushes, reopened, marked ready for review) |
| `hotfix/*`, `chore/sync-*` → `develop` | No. The gate check passes at once. |
| `feature/*`, `bugfix/*`, `chore/*`, … → `release/x.y.z` | No |
| `develop` → `main`, `hotfix/*` → `main` | No |
| Pushes to any branch, schedules | No |

`develop` only accepts release branches, hotfixes and `chore/sync-*` back-merges (see
[the development workflow](../development-workflow.md)), so all other work reaches it through a release PR and this
gate. Draft release PRs don't run it. Marking the PR ready for review starts the run. A `release/*` branch from a fork
never runs it, and the gate fails for it.

## What it tests

The release candidate as it would land: the API image built from the PR (GitHub tests the PR merged with `develop`),
started with its own Postgres and Mailpit on the runner. Nothing touches the shared development environment, and no
secrets or production settings are used.

- **Data:** every test signs up its own synthetic parents (`…@example.test`) and family, so tests are independent
  and can run in parallel. Emails are read from Mailpit, like a real inbox.
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
On `develop`, under **Settings → Branches** (or the ruleset that protects it):
1. Add **Release E2E gate** to the required status checks. Keep the existing ones (Backend, Frontend, API image,
   PR source).
2. Don't add **Playwright (release candidate)** as a required check. On ordinary PRs that job is skipped, and GitHub
   counts a skipped required check as passed. The gate job always runs and checks the real result.
3. **Approval:** GitHub doesn't let you approve your own PR, so no approval rule is added. **The owner merging the
   release PR is the approval.** Nobody else merges `release/*` into `develop`.

If a release PR has no **Release E2E gate** check at all (for example, it was opened against another branch and then
retargeted to `develop`), close and reopen it, or push a commit, to run it. Until then the merge stays blocked, which
is the safe default.

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
image (cached between runs), installing Chromium (cached), about 20 seconds of tests, and uploads. It runs only on
release PRs, and a new push cancels the run it replaces. The expanded mobile matrix requires a fresh timing measurement; keep the existing job timeout unless evidence justifies increasing it.

## Discord
The `notify` job posts the result to the existing Parenthesis Discord webhook, read from the `DISCORD_WEBHOOK_URL`
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
transitions and verifies local fields and persisted UTC duration after an edit. Ambiguous/nonexistent wall times
themselves, other time zones and real-device date input still need separate acceptance.

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
policy only; browser execution still runs exclusively for release/* → develop under the existing gate semantics.

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
| #248/#249 | `date recovery and reminder touch selection…`; existing date journey | `touch Edit and Swap…` adds both themes; Chicago spring/fall edit boundaries added; past/today and ambiguous local times remain |
| #250 | existing Month continuation/details journey; `Month pending overflow…` geometry/reachability | Broader dense/repeated/year-boundary mobile matrix and actual spoken dates |
| Text/reflow | `200% text enlarges content…` | OS text scaling, pinch zoom, magnification and clipping with longer localized content |

Implementation evidence was updated on October 26: release PR #315’s full Playwright run
[40316038202](https://github.com/esaldivar/parenthesis/actions/runs/40316038202) passed **179 executions** and its
release summary check. Its tested merge candidate is `92be9b9e962751f6e6fa3c273d6cb62836eae46e`, not the branch
head. This supersedes the earlier statement that no supported runner had executed the foundation.

The subsequent recovery/DST/overflow-negative and accessibility additions are **not covered by that historical
run**. They require fresh candidate browser execution through the existing release gate. Local typecheck,
discovery and report-policy tests do not substitute for it. Docker is unavailable in this workspace; no product
acceptance or physical-device/screen-reader certification is inferred. See the
[follow-up evidence record](calendar-coverage-followup-2026-10-26.md).

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
cannot count as green. Ordinary PR CI continues typechecking/discovery/report-policy checks only; browser
execution stays on release PRs. No baseline or automatic waiver is added.

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
