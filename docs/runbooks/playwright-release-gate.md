# Playwright release gate

End-to-end tests that keep a release from breaking what already works (owner decision, October 18, 2026). They run
only on milestone release PRs, `release/x.y.z` → `develop`, and test the current milestone **and every milestone before
it**. A failure blocks the merge.

| | |
|---|---|
| Workflow | [`.github/workflows/playwright-release.yml`](../../.github/workflows/playwright-release.yml) |
| Tests | [`tests/e2e/`](../../tests/e2e/) (Playwright, Chromium) |
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
The repository is public, so GitHub-hosted runners cost nothing. Each run takes about 8–10 minutes: building the
image (cached between runs), installing Chromium (cached), about 20 seconds of tests, and uploads. It runs only on
release PRs, and a new push cancels the run it replaces. Chromium is the only browser. Add others only if the
supported platforms call for it, and say so in the PR.

## Discord
The `notify` job posts the result to the existing Parenthesis Discord webhook, read from the `DISCORD_WEBHOOK_URL`
secret. The post has the headline, the branch and PR number, test counts per milestone, and links to the PR and the
run. Mentions are turned off. The job runs no PR code: it only reads the summary file. If the secret is missing or
Discord is down, the job logs a warning and the gate result stands.
