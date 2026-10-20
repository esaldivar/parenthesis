# Development workflow

The authoritative reference for branches, releases, environments, PR limits, Copilot reviews and Discord notices
(owner briefs and decisions, October 18, 2026). Day-to-day conventions (checks, merging, commit style) are in
[CONTRIBUTING.md](../CONTRIBUTING.md). The automation lives in `.github/scripts/` and the workflows named below.

## Branches and releases

```text
main                      production (real families)
 └─ develop               the private development site
     └─ release/0.2.0     one milestone, one release; cut from develop
         ├─ feature/parent-registration
         ├─ bugfix/child-pin-validation
         └─ docs/…, chore/…, design/…
hotfix/…                  from main, for urgent production bugs
```

- **`main`** is production. No direct pushes, no unreviewed changes, no automatic production deployments: each one
  waits for the owner's approval. Rollback is always available (below).
- **`develop`** keeps its name (owner decision) and is the private development site. It is **not** an open
  integration branch: it only takes tested milestone releases (`release/x.y.z`), hotfixes and their syncs
  (`chore/sync-…`). Every merge deploys to the development site automatically.
- **`release/x.y.z`**: one per milestone, cut from the latest `develop`. Only the active milestone's branch exists
  at a time; future ones are never created ahead. Every feature, fix, doc and tooling change for the milestone
  targets it, including Sonar Sunday fixes.
- **Work branches** (`feature/`, `feat/`, `bugfix/`, `fix/`, `chore/`, `docs/`, `design/`) start from the active
  release branch and PR back into it. Never merge an incomplete feature into `develop` or `main`, and never merge a
  PR automatically.
- **Hotfixes** for urgent production bugs: branch from `main`, make the smallest safe fix, test, open a PR into
  `main`, get the owner's approval, deploy (approval again in Actions), verify production, then sync into `develop`
  (`chore/sync-main`) and the active release branch. Hotfixes may ship outside a release window, never without
  approval.
- The **PR source** check enforces which branch may merge into which (`.github/scripts/check-pr-branch-policy.sh`).
  Release branches must be named `release/x.y.z`.

### Feature workflow
Every PR, including releases, hotfixes and syncs, must list relevant real tracking issues under **Tracking issues**.
Use one non-closing `Refs #123` line per issue; release rollups may reuse closed issues. The read-only **Tracking
issue links** check validates issue existence, and must be made required separately after trusted-base rollout.
See [the issue-link policy and activation runbook](runbooks/pr-issue-links.md). Issue acceptance and verified
deployment remain separate decisions. Existing PRs need real links supplied by their authors, not unrelated issues.

1. Branch from the active release branch.
2. Implement it and run the relevant tests.
3. Open a PR into the release branch (within the weekly PR limit below).
4. Required checks run; request a Copilot review within the review limits.
5. Resolve blocking issues.
6. The owner merges it (squash).

### Milestones

Each milestone is one release. The backlog's items are mapped to them in [the backlog](planning/mvp-backlog.md).

| Version | Milestone | Scope |
|---|---|---|
| v0.1.0 | 1. Foundation | Architecture, configuration, design system, foundational UI, dashboard foundation, development infrastructure |
| v0.2.0 | 2. Accounts and profiles | Parent registration, authentication, invitations, child profiles, child PINs, profile picker, permissions |
| v0.3.0 | 3. Calendar and approvals | Shared calendar, parenting schedules, event proposals and approvals, change requests, calendar notifications |
| v0.4.0 | 4. Communication (proposed) | Parent messaging, family communication, notifications, shared family information |
| v0.5.0 | 5. Child experience (proposed) | Child dashboard, artwork and photos, journal, child privacy controls |
| v1.0.0 | Private beta | All milestones integrated, security validation, end-to-end tests, production readiness, invitation-only |

**Starting point (owner decision, October 18, 2026):** `main` holds the Milestone 1 foundation. `develop` already
holds Milestone 2 work and some Milestone 3 backend work (calendar, approvals). `release/0.2.0` is cut from `develop`
as it is, and Milestone 2 is finished there. The Milestone 3 backend work already in `develop` comes along with
0.2.0; Milestone 3 (0.3.0) finishes it. Before 0.2.0 reaches production, check that nothing unfinished from
Milestone 3 is reachable in the app (TODO.md).

## Release windows

Production releases happen in **windows every other Friday, America/Chicago**, starting **October 30, 2026**. The
calendar is `.github/release-windows.json`:

| Scheduled | Actual | Why |
|---|---|---|
| Fri, Oct 30, 2026 | Fri, Oct 30 | First window |
| Fri, Nov 13, 2026 | Fri, Nov 13 | |
| Fri, Nov 27, 2026 | **Wed, Nov 25** | Day after Thanksgiving (owner decision) |
| Fri, Dec 11, 2026 | Fri, Dec 11 | |
| Fri, Dec 25, 2026 | **Wed, Dec 23** | Christmas (owner decision) |
| Then every 14 days | Fri, Jan 8, 2027, … | |

- A window is an **opportunity, not a deadline**. If the milestone isn't ready or stable, skip it: keep the release
  branch open, keep testing, and aim for the next window. Never skip testing or approval to meet a date.
- Holidays: dates listed under `holidays` in the calendar file are flagged for the owner when a window lands on them.
  Nothing is moved or deployed on a holiday without approval. To move or cancel a window, edit `moved` or `skipped`.
- `.github/workflows/release-window.yml` runs daily and, on the days below, opens or updates a **Release window**
  checklist issue and tells Discord. It never merges or deploys anything.

| Day | What happens |
|---|---|
| Week 1, Mon–Wed | Features, fixes, PR reviews, automated tests on the release branch |
| Week 1, Thu–Fri | Finish the scope, stabilize, integration tests, fix release blockers, draft release notes |
| Week 2, Monday | Checklist issue opens. PR `release/x.y.z` → `develop`; once approved and merged it deploys to the development site |
| Week 2, Tue–Wed | Test on the development site: authentication and authorization, family workflows, database changes. Fix critical defects on the release branch and retest |
| Day before the window | Readiness review: acceptance criteria, deployment plan, rollback. Discord asks for owner approval |
| The window | PR `develop` → `main`, merged once approved. The production deployment waits for the owner's approval in Actions, then runs smoke tests, tags the version and publishes release notes. Discord confirms |

For a moved window (a Wednesday), the same steps happen on the Monday, the day before and the day of that week.

## Promotion

1. **Release branch.** All the milestone's PRs are merged, required checks pass, stabilization is done.
2. **`release/x.y.z` → `develop`.** Passing checks, including the **Release E2E gate**: Playwright tests the
   release candidate for this milestone and every one before it, and a failure blocks the merge
   ([runbook](runbooks/playwright-release-gate.md)). Release notes written, no open blocking defects, and the owner's
   approval. Merge with a **merge commit**. The development deployment then builds the image, runs migrations and
   smoke tests, and records the tested commit (GitHub's deployment history for the `development` environment). If
   testing fails, production is blocked: fix it on the release branch and repeat.
3. **`develop` → `main`.** Successful development testing, an approved release candidate, a verified rollback, and
   the owner's approval. The PR must contain only that tested release; if `develop` holds anything else, stop and
   propose a safer promotion. Merge with a **merge commit**.
4. **Production deployment** (`.github/workflows/deploy.yml`): it deploys the **exact image tested on `develop`**,
   never a rebuild. It refuses to run when `main`'s files differ from the merged `develop` commit, when that commit
   has no successful development deployment, or when no untagged `release/x.y.z` is contained in `main`. After the
   owner approves it: migrations, deployment, smoke tests and health checks, the `vX.Y.Z` tag and release notes,
   then Discord. A failed deployment rolls back to the previous image automatically. Hotfixes build a new image from
   `main` (they skip the development site) and get the next patch version.

## Environments and deployment

Hosting is Azure, as the architecture chose: Azure Container Apps, Azure Database for PostgreSQL Flexible Server,
Blob Storage and Key Vault. Setup steps: [the Azure runbook](runbooks/azure-environments.md). Until it's done, the
repository variable `DEPLOY_ENABLED` is unset and the deploy workflow does nothing.

| | Development | Production |
|---|---|---|
| Deploys from | `develop`, on every merge | `main`, after the owner approves each deployment |
| GitHub environment | `development` (deployments from `develop` only) | `production` (from `main` only; owner is the required reviewer) |
| Access | Invite-only accounts: sign-up only for allow-listed tester emails | Invitation-only families (private beta) |
| Data | Its own database. **Synthetic data only**, never real families | Its own database, backups |
| Secrets | Its own Key Vault and managed identity | Its own Key Vault and managed identity |
| Checks | Smoke tests (`/health/live`, `/health/ready`, the app shell) | The same, plus monitoring (Application Insights) |

- Images go to GitHub Container Registry as `ghcr.io/esaldivar/parenthesis-api:sha-<commit>`, and released ones are
  also tagged `vX.Y.Z`.
- Azure sign-in uses OpenID Connect (no stored passwords): each environment has its own identity, limited to its
  own resource group.
- Migrations run as a one-off Container Apps job with the same image (`migrate`) before the app is updated, so they
  must be backward compatible (add first, remove in a later release).

### Rollback
- **Automatic:** if the deployment or its smoke tests fail, the workflow puts the previous image back.
- **By hand:** Actions → Deploy → Run workflow from `main` (production) or `develop` (development), with the
  environment and a released version (for example `v0.2.0`). Production still needs the owner's approval.
- **Database:** migrations aren't undone automatically. Restore with PostgreSQL's point-in-time restore (see the
  runbook), which is why migrations must stay backward compatible.

## Branch protection (owner settings)

These are repository settings the owner applies; nothing in the repository can change them. Click-by-click steps are
in [the Azure runbook](runbooks/azure-environments.md#github-settings).

| Branch | Rules |
|---|---|
| `main` | Existing protection (PRs only, required checks up to date, no force pushes or deletion, admins included). Required checks include **PR source** and the SonarCloud quality gate. |
| `develop` | Existing protection, plus **PR source** and **Release E2E gate** as required checks. |
| `release/*` | A ruleset: PRs only, required checks (Backend, Frontend, API image, PR source) up to date, no force pushes, no deletion. Admins included. |
| Environments | `production`: required reviewer = the owner, deployments from `main` only. `development`: deployments from `develop` only. |

- GitHub can't restrict a PR's source branch, which is why **PR source** is a check; it only blocks merging once it's
  a required check on each protected branch.
- GitHub can't require an approval from a PR's own author, so the owner's approval is enforced on the production
  **deployment**, not on the PR.
- Automation (GitHub Actions) can't push to protected branches: workflows only comment, open issues, tag releases and
  deploy.

## Weekly limits

| Limit | Value |
|---|---|
| New development PRs | **3 per week** |
| GitHub Copilot reviews | **6 per week** |
| Copilot reviews per PR | **2**: one initial review and one follow-up after corrections |

- The week starts **Monday at 12:00 AM, America/Chicago**. Unused allowance doesn't roll over.
- The limits apply to PRs opened from **Monday, October 19, 2026**. Earlier PRs stay valid and never count.
- A PR counts in the week it was **created**. Closing and reopening it doesn't count it again, and doesn't reset its
  Copilot review count.
- **Not counted:** releases and promotions between permanent branches (`develop` → `main`, `release/*` →
  `develop`), `chore/sync-…` back-merges, `hotfix/…` PRs, PRs opened by bots (Dependabot), and PRs
  labeled `replacement` because they replace an earlier PR (for example, one moved to a correctly named branch).
- **Exceptions:** only the owner grants them, with a label. GitHub records who added a label, and the workflows only
  accept it when the repository owner added it.
  - `owner-approved-pr`: allows a PR beyond the weekly limit.
  - `owner-approved-review`: allows a Copilot review beyond either Copilot limit.

## Before opening a PR (Claude Code sessions)

1. Check this week's usage:
   `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt GITHUB_REPOSITORY=esaldivar/parenthesis node .github/scripts/dev-workflow.mjs usage`
   (in a cloud session; elsewhere just set `GITHUB_TOKEN` and `GITHUB_REPOSITORY`).
2. If the limit is reached, don't open the PR. Keep working and committing on the branch; open it when the week
   resets, or ask the owner for an exception.
3. Group related work into one PR, and don't open PRs for minor changes on their own.
4. Never merge a PR automatically, and never open duplicate PRs to get around the limit.
5. For a **major** PR (see below), send the owner a summary on Discord **before** opening it:
   write the message to a file, then run `node .github/scripts/dev-workflow.mjs send FILE`, with the same
   environment variables as step 1 plus `DISCORD_WEBHOOK_URL`. If it fails, tell the owner; don't assume it arrived.
6. Fill in the PR template, including **Testing**, **Risks and known issues** and **Outstanding work**: the Discord
   notice is built from those sections.

## Local Claude queue (owner-approved issues)

The owner can have Claude Code implement an approved coding issue on the owner's own machine, with the owner's Claude
subscription (owner decision, October 19, 2026; #94). A Windows scheduled task on that machine checks every hour
(owner decision, October 19, 2026: fully automated), and the owner can also start it by hand. It runs one issue at a
time, never repeats an issue that already has a queue branch or PR, and only for issues with Status **Ready For Development**, the `claude-implementation` label, and the
`owner-approved-claude` label added by the owner. It opens a **draft** PR into the active release branch and never
merges, deploys or changes labels; it does keep issue Status on the board in step with each issue's PRs, up to Done (work on `main`, issue closed). At the weekly PR limit a scheduled run does nothing until the week resets. The
owner's approval label is the only trigger. The weekly PR limit, Discord notices and every required check apply as above.
How to run it: [the local Claude queue runbook](runbooks/claude-local-queue.md).

## Copilot reviews

- **Settings (checked October 18, 2026):** no automatic-review ruleset, so Copilot reviews only when someone asks.
  Review effort level is **Lite**. "Allow Copilot to approve pull requests" is **off**. Keep it this way: an
  automatic-review ruleset would review on every push and use up the allowance.
- Request a review only for the initial review and one follow-up, and only within the weekly limit. Never request
  one after every push.
- `.github/workflows/copilot-review-usage.yml` runs on every review request. When Copilot is the reviewer, it counts
  the PR's Copilot reviews (all time) and the week's. It comments when the week reaches 5 or 6. Over a limit without
  `owner-approved-review`, it comments on the PR, alerts Discord and fails.

## Discord notices

A PR is **major** if it has the `major` label, or if it changes any of:
- database migrations (`…/Migrations/`)
- authentication or authorization (the Identity module, `auth`/`identity` folders, antiforgery)
- security-sensitive code (`CoParent.SharedKernel/Security/`, `SECURITY.md`)
- infrastructure or CI (`.github/workflows/`, `docker/`, Dockerfiles, `compose.yaml`, `infra/`, Bicep)
- a large amount of code (30+ files or 1,500+ changed lines)

Multiple significant features or core-functionality changes that the paths don't reveal need the `major` label. The
`not-major` label turns automatic detection off for a PR that only looks major (release PRs are still announced).

| When | Who sends it |
|---|---|
| A major PR is being prepared | Claude, before opening it (step 5 above) |
| A major PR is opened, or marked ready for review | `discord-pr-notify.yml` |
| Any PR into `main` or a `release/*` branch, or a release branch into `develop`, is opened or ready, whatever its size | `discord-pr-notify.yml` |
| A release candidate (a PR into `main`) needs owner approval | `discord-pr-notify.yml` ("release candidate" notice), and `release-window.yml` the day before the window |
| Release week starts, the readiness review, and the window itself | `release-window.yml` |
| A deployment to development or production succeeds or fails | `deploy.yml` |
| A major or release PR is labeled `blocked` (a significant risk or blocker) | `discord-pr-notify.yml`, once per commit |
| A PR goes over the weekly PR or Copilot limit | `pr-weekly-limit.yml`, `copilot-review-usage.yml` |
| Monday report | `weekly-dev-status.yml` |

- Drafts aren't announced until they're marked ready. Routine and small PRs aren't announced.
- Each message has the PR number, title and link, source and target branches, why it's major, type of change,
  summary, changes, testing, risks and known issues, outstanding work, and whether owner approval is needed. It never
  includes the diff. A release PR without a "Summary of changes" lists its commit titles instead.
- **No duplicates:** after sending, the workflow leaves a comment on the PR with a hidden marker, and doesn't send
  the same notice again (for example, when the PR is reopened).
- **Failures are reported:** a failed notice turns the run red and comments on the PR. Nothing is assumed delivered.

## Weekly status report

`weekly-dev-status.yml` runs every Monday just after the reset (06:15 UTC) and sends last week's report to Discord:
development PRs created, PR allowance, Copilot reviews used, PRs awaiting review, major changes merged, branches with
work and no PR, release readiness (`develop` vs `main`), and `blocked` issues and PRs. Metrics GitHub doesn't
expose are listed as not available; counts are never estimated. Run it by hand from the Actions tab (it defaults
to this week, as a dry run that only shows the report).

## What GitHub can and can't enforce

| Rule | How it's handled |
|---|---|
| 3 PRs a week | **Can't stop a PR from being opened.** The **Weekly PR limit** check fails on the 4th and later PRs of the week until the owner labels them. **Owner setting:** make it a required check on `develop` to block merging them. |
| 6 Copilot reviews a week, 2 per PR | **Can't stop or cancel a review request.** Counted and reported when it happens (PR comment, Discord, failed run). For Claude, it's a rule: check usage before requesting. |
| No automatic re-reviews | **Repository setting:** no Copilot automatic-review ruleset (current state). |
| Exceptions | **Owner action:** the `owner-approved-pr` or `owner-approved-review` label, accepted only from the owner. |
| No automatic merging | Auto-merge is off for the repository, and Claude never merges. |
| Notices and the weekly report | Automatic, through the `DISCORD_WEBHOOK_URL` repository secret. |

## Security

- The webhook URL is only in the `DISCORD_WEBHOOK_URL` Actions secret (and the cloud environment for Claude). It is
  never committed or printed; error messages only give the HTTP status.
- The PR workflows use `pull_request_target`: they run the workflow and script from the **base** branch, check out
  only `.github/scripts` from it, and never check out or run the PR's code. A PR can't change the rules it's
  checked against, and untrusted code never runs with the secret.
- Permissions are the minimum each workflow needs (read contents; write PR comments where it comments).
- PR text goes into Discord with mentions disabled, so a title can't ping `@everyone`. Only synthetic data belongs in
  PRs (see CONTRIBUTING.md), so no family information reaches Discord.

## Known limitations

- GitHub has no API to block opening a PR or requesting a Copilot review, so those limits are detected and
  reported, not prevented.
- Copilot reviews are counted from the reviews Copilot leaves. A request that never produces a review counts as
  pending while it's open. Copilot's billing (premium requests) isn't available per repository.
- The PR workflows run from the base branch, so they start working for PRs into a branch once they've been merged
  into it. Scheduled workflows only run from the default branch, so the Monday report starts after the next release
  to `main`.
- Major detection is path-based. Use the `major` label for anything significant it misses, and `not-major` for false
  alarms.
- The Discord message is limited to about 1,900 characters; long sections are shortened.
