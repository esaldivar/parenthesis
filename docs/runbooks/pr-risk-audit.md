# PR risk audit (#141)

Phase 1 is the inventory and gap analysis below. Phase 2 is the report-only **PR risk** check
(`.github/workflows/pr-risk.yml`, `.github/scripts/pr-risk.mjs`). Phase 3 (required checks and mandatory review) waits
for the owner's approval after the report has been checked on real PRs.

## 1. What protects PRs today (read from the repository and GitHub settings, October 29, 2026)

### Required checks, by target branch

| Check | `release/*` (ruleset "release branches") | `develop` (branch protection) | `main` (branch protection) |
|---|---|---|---|
| Backend (build, format, tests) | Required | Required | Required |
| Frontend (lint, test, build) | Required | Required | Required |
| API image | Required | Required | Required |
| PR source (main accepts develop or hotfix/*) | Required | Required | Required |
| Tracking issue links (#132) | Required | Required | Required |
| Release E2E gate (Playwright, five profiles) | Required | Required | Not required (develop's tested image is promoted) |
| NVDA accessibility gate | Required | Not required | Not required |
| SonarCloud Code Analysis / SonarQube Cloud | Not run | Runs on PRs into develop; not required (#373) | Not scanned; the Release security gate reuses develop's analysis of identical code (#373) |

`develop` and `main` require up-to-date branches (strict) and apply to admins. No branch requires an approving review:
the owner merges. Deletion and force-pushes are blocked on all three.

### Other automation

| Workflow | Runs on | What it does |
|---|---|---|
| `ci.yml` | Every PR; pushes to main, develop, release/** | Backend, frontend, API image, E2E tooling, security and health-report script tests |
| `playwright-release.yml` | PRs into develop and release/** | Release candidate Playwright matrix and the Release E2E gate |
| `nvda-runner-probe.yml` | PRs into release/** | NVDA website tests and gate |
| `pr-branch-policy.yml` | Every PR | Allowed source → target combinations |
| `pr-issue-links.yml` | Every PR (`pull_request_target`, read-only) | Verified tracking issues (#132) |
| `pr-milestones.yml` | Every PR (`pull_request_target`, read-only) | Report-only milestone inheritance (#140) |
| `pr-weekly-limit.yml` | Every PR (`pull_request_target`) | Release-promotion weekly cap and its owner label |
| `copilot-review-usage.yml` | Review requests (`pull_request_target`) | Copilot review weekly usage |
| `discord-pr-notify.yml` | PR events (`pull_request_target`, pull-requests: write) | Discord summaries |
| `sonar.yml`, `sonar-sunday.yml` | PRs into and pushes to develop and main; Sundays | SonarQube Cloud analysis of develop (main reuses it, #373) and the weekly report on develop |
| `deploy.yml` | Pushes to develop and main | Deploys; production waits for the owner's approval and the release security gate |
| `workflow-scripts.yml` | PRs touching `.github/` or queue scripts | Unit tests for workflow scripts and the Claude queue |
| `claude-queue-dry-run.yml` | Manual | Read-only Claude queue selection |
| Rulesets "Copilot review for default branch" and "Copilot release review" | main; develop | Copilot code review. The release one is Active only around a release → develop PR |

### Gaps

- **No risk signal on PRs.** A change to authentication, migrations or child-data access looks the same as a copy
  edit in the PR list. Phase 2 below adds it, report-only.
- **No automatic migration-safety check.** Destructive migrations (dropping or renaming columns or tables) rely on
  review alone. Phase 2 flags them; it doesn't block.
- **Sonar doesn't run on work PRs into `release/*`.** It analyses `develop` and PRs into it (#373), so findings in
  release work surface when the release PR into `develop` opens (the Sonar Sunday report narrows the gap).
- **No required human review.** Acceptable for a single owner; phase 3 can require it for high-risk changes only.
- **Not covered by the classifier:** new outbound integrations (for example the Google Places call, #354) and
  privacy-relevant UI copy. Review them by hand.
- The checks above are read from the live settings on the date shown; recheck them before relying on this table.

## 2. The PR risk report (phase 2, report-only)

On every push to a PR it reads GitHub's list of changed files (never labels, never the PR's own code) and reports:

| Risk | Triggered by |
|---|---|
| `security-review` | Identity module, `SharedKernel/Security`, data protection, API hosting, frontend `core/auth`, backend files named for auth, antiforgery, cookies, passwords, PINs, tokens, secrets, crypto, permissions or policies, workflows and security scripts, Docker, appsettings |
| `database-change` | Any `Migrations/` folder, DbContexts, persistence code. **Destructive** when a migration drops, renames or alters data, or a migration file is removed |
| `breaking-change` | Backend `Endpoints/` and `Contracts/`, the frontend API client. Removed or renamed API files are called out |
| `high-risk` | Account deletion, tenancy, the Families module's domain, endpoints and infrastructure, the Approvals module (ADR-0003), Restrict/purge/erase (ADR-0005) |

A renamed file is judged by its old and new path. File names match whole words in their original case (`ParentPin.cs`
yes, `EventMapping.cs` no). The summary lists file names only, never contents. High-risk, destructive or incomplete
results add a warning annotation; nothing fails.

**Security model.** `pull_request_target` runs the trusted copy on `main` with read-only `contents` and
`pull-requests` permissions. It never checks out or runs the PR's code, so fork PRs are safe and classified the same
way. Because it runs from `main`, it reports on real PRs only after it reaches `main` through the normal release.

## 3. Rollout

1. Once on `main`, check the report on representative PRs: a UI-only change, a workflow change, a migration, an API
   change and a release promotion. Note false positives and misses in #141, with run links.
2. **Labels (owner decision):** applying the four labels needs `pull-requests: write` in `pr-risk.yml`. They'd be
   for visibility only; any enforcement recomputes risk from the files, so removing a label can't bypass it.
3. **Enforcement (phase 3, owner approval):** a required check or mandatory review for `high-risk` and destructive
   `database-change`, configured as a reviewed ruleset change. Until then, describe this as not enforced.
