# NVDA website CI — #364

`.github/workflows/nvda-runner-probe.yml` runs on every PR targeting `release/**`, without a path filter.
It builds the checked-out merge candidate's API and Angular app on hosted Windows Server 2022, starts a private
PostgreSQL 17.11 cluster and Mailpit 1.31.6, applies migrations to that cluster only, and serves the website over
loopback HTTPS. The five existing Guidepup tests run serially using real NVDA; this covers the smoke fixture,
parent navigation, activity form labels/validation, activity saving and calendar event dialog keyboard/focus behavior.
It is not a complete audit of every page or WCAG conformance, and does not certify VoiceOver or mobile readers.

The startup script downloads tools with SHA-256 verification and creates its own database, certificate, mailbox
and process records below `RUNNER_TEMP`. Occupied ports, wrong source metadata, missing Angular output and failed
health/API checks stop the job before NVDA. Teardown always attempts to stop only the recorded candidate processes
and private database. It never uses the machine's preinstalled database service or the owner's user-secrets.
The readiness, path containment, checksum and child-lifecycle guards have standalone PowerShell tests.

`NVDA accessibility gate` is the stable status-check name. It always checks the Windows job's result and rejects
failure, cancellation or skipping. The Windows job also requires an exact-revision JSON report with every one of
the five expected scenarios passing once, no retries/skips, and non-empty captured speech for each test.
New scenarios must be added to the report policy as well as the test suite. Fork execution is blocked and cannot
produce a green gate. No branch rules are changed by this workflow.

## Evidence

The `nvda-website-results` artifact includes the HTML report, JSON results, speech attachments and candidate logs.
Open `guidepup-report` with `npx playwright show-report <path>`. Candidate logs include the Git SHA/tree,
Postgres/Mailpit/.NET/OS versions and Chromium/Guidepup NVDA asset manifest. Setup CLI is pinned to 0.29.3.
Private state files, database contents, password and certificate key are excluded from artifact upload.
Treat traces as private synthetic-session diagnostics; retention is 14 days. Archive sanitized acceptance evidence
in #364 before expiry. Local or synthetic script checks are not hosted NVDA acceptance evidence.

## Owner configuration of the release ruleset

After a successful full-suite run exposes the check:

1. Open repository **Settings → Rules → Rulesets**, then edit the existing release-branch ruleset.
2. Confirm its target includes `release/*` (matches `release/0.3.0`) and its enforcement status is **Active**.
3. Under **Require status checks to pass**, add **NVDA accessibility gate**, with GitHub Actions as the source.
   Require this gate rather than the Windows job or the former smoke-only `NVDA runner compatibility` check.
4. Keep every existing required check, including **Release E2E gate**, Backend, Frontend, API image and PR source.
5. Keep **Require branches to be up to date before merging** enabled. Preserve PR-only changes and the existing
   force-push/deletion restrictions; do not add a bypass to make a failing run mergeable.
6. Save. Verify on a PR into `release/0.3.0` that the exact check appears as required, and retain that evidence in #364.

The workflow's presence alone does not establish branch-rule enforcement. A missing/not-yet-completed check must
remain pending, and startup or NVDA failures must be fixed rather than bypassed. A superseded run's success is not
evidence for the new merge candidate. This workflow does not change the existing develop or production policies.

GitHub's current [ruleset instructions](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
describe target patterns and required status checks.
