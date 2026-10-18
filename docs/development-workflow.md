# Development workflow: PR limits, Copilot reviews and Discord notices

This is the authoritative reference for these rules (owner brief, October 18, 2026). Branches, checks and merging are
in [CONTRIBUTING.md](../CONTRIBUTING.md). The automation lives in `.github/scripts/dev-workflow.mjs` and the
workflows named below.

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
- **Not counted:** releases and promotions between permanent branches (`develop`/`development` → `main`,
  `release/*` → `development`), `chore/sync-…` back-merges, `hotfix/…` PRs, PRs opened by bots (Dependabot), and PRs
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
| Any PR into a release branch (`main`, `development` or `release/*`) is opened or ready, whatever its size | `discord-pr-notify.yml` |
| A release candidate (a PR into `main`) needs owner approval | `discord-pr-notify.yml` ("release candidate" notice) |
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
