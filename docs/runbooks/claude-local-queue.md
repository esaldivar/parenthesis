# Local Claude queue

Runs one owner-approved coding issue with Claude Code **on the owner's machine**, signed in with the owner's Claude
subscription, and opens a **draft** PR into the active release branch (owner decision, October 19, 2026; issue #94).
It's **fully automated**: a Windows scheduled task checks every hour while the owner is signed in to the PC (owner
decision, October 19, 2026), so approving an issue is all it takes. No Claude credential is stored in GitHub, and no
Claude runs in GitHub Actions. It never merges, deploys, changes labels or moves cards on the board.

| | |
|---|---|
| Runner | [`scripts/claude_queue_run.py`](../../scripts/claude_queue_run.py) |
| Selection | [`scripts/claude_queue_select.py`](../../scripts/claude_queue_select.py) (also used by the read-only **Claude Queue Dry Run** workflow) |
| Approval check | [`scripts/claude_queue_approval.py`](../../scripts/claude_queue_approval.py) |
| Schedule | [`scripts/claude_queue_schedule.ps1`](../../scripts/claude_queue_schedule.ps1) (the hourly Windows task) |
| Tests | `tests/test_claude_queue_*.py`, run in CI by **Workflow script tests** |
| Active release / milestone | `release/0.3.0` / `M3 — Calendar` (constants at the top of the runner) |

## Approving an issue

An issue runs only when **all** of these are true:

1. It's open, in Project #2, in the milestone `M3 — Calendar`, with Status exactly **Ready For Development**, exactly
   one priority, and no `blocked` label.
2. It has the **`claude-implementation`** label. Only coding issues get it; design, validation and other non-coding
   issues never do.
3. It has the **`owner-approved-claude`** label, and the issue history shows **the owner** added it most recently
   (checked by GitHub user ID), with no removal since.
4. Nobody changed the issue's title or text after the owner's approval. If it changes, remove and re-add
   `owner-approved-claude` to approve the new text.

Approval is checked when the run starts and again just before anything is pushed.

## One-time setup

- Python 3.12, Git, Node.js, the .NET SDK and the GitHub CLI on PATH.
- `gh auth login` as the owner. Project access may need `gh auth refresh -s read:project`.
- Claude Code installed and signed in with `/login` (Claude subscription). `claude auth status` must show
  `"authMethod": "claude.ai"`; the runner refuses an API key and removes `ANTHROPIC_API_KEY` from Claude's environment.
- For major PRs: a `DISCORD_WEBHOOK_URL` user environment variable on this machine. GitHub secrets can't be read back,
  so copy the URL from Discord (channel → Edit Channel → Integrations → Webhooks → Copy Webhook URL) and save it
  without echoing it:

  ```powershell
  $u = [Net.NetworkCredential]::new('', (Read-Host 'Paste Discord webhook URL' -AsSecureString)).Password.Trim(); [Environment]::SetEnvironmentVariable('DISCORD_WEBHOOK_URL', $u, 'User'); Remove-Variable u
  ```

  Then open a new terminal. Never commit or paste the URL.

## Running it

From a checkout that contains the runner (`release/0.3.0` until v0.3.0 reaches `develop`):

```powershell
python scripts/claude_queue_run.py --plan                       # select and verify only; changes nothing
python scripts/claude_queue_run.py                              # top eligible issue, interactive Claude session
python scripts/claude_queue_run.py --issue 72                   # a specific eligible, approved issue
python scripts/claude_queue_run.py --issue 72 --mode headless   # no prompts; only pre-allowed tools, 60-minute limit
python scripts/claude_queue_run.py --kind bugfix                # bugfix/<n>-<slug> instead of feature/<n>-<slug>
```

`--plan` is the safe way to see what the next run would pick.

## Running it on a schedule

Set up once, from any checkout that has the script (after this is merged into `release/0.3.0`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claude_queue_schedule.ps1
```

It checks that the tools are on your saved PATH, makes a dedicated checkout next to the repository
(`..\parenthesis-queue`, detached, never your own working copy), and registers the **Parenthesis Claude queue** task:
every hour while you're signed in to Windows (a locked screen counts), with no window. Run it again to update the
task; add `-Remove` to remove it. `Start-ScheduledTask -TaskName 'Parenthesis Claude queue'` runs it once now.

Each scheduled run (`--scheduled`):

- updates the dedicated checkout to `origin/release/0.3.0` first, so merged runner changes apply at once;
- takes the top approved issue that doesn't already have a queue branch or PR (merged or not), so it never repeats
  one. To run an issue again, delete its branch and close or delete its PR first;
- runs Claude **headless** (only the pre-allowed tools, 60-minute limit), then the same checks and guards as below;
- does nothing when no issue is waiting, another run is going, or the weekly PR limit is reached (the issue waits
  for Monday's reset). Idle checks leave no log;
- sends one Discord line when it opens a draft PR, and one when it stops on a problem. The same problem isn't
  reported again every hour; a different one is;
- clears the lock left by a run that crashed or was killed.

Your PC must be on and you signed in; runs missed while it was off start as soon as it's back. Docker must be running
for the backend tests.

## What a run does

1. Checks that `gh` is signed in as the owner, Claude Code is signed in with the subscription, and no other run is in
   progress (lock file).
2. Selects the issue and verifies the owner's approval (above).
3. Checks this week's PR count (`dev-workflow.mjs usage`). At the limit of 3 it stops **before** Claude runs (a
   scheduled run just waits). With `--commit-only` (by hand only) it runs and commits locally, with no push and no
   PR, as the weekly-limit rules require.
4. Creates a separate worktree, `../parenthesis-claude-<n>`, from a fresh `origin/release/0.3.0`, on
   `feature/<n>-<slug>` (or `bugfix/`). It stops if the branch or folder already exists.
5. Runs Claude Code in that worktree with the issue text marked as data. Claude can read, edit and run the build and
   test commands. It can't commit, push, use `gh` or the network, or edit `.github/`, `.claude/`, `CLAUDE.md`,
   `SECURITY.md`, `CONTRIBUTING.md`, `docs/adr/`, `docs/runbooks/`, `docs/development-workflow.md`, Sonar config or
   the queue scripts and tests. MCP servers and the owner's own Claude settings are not loaded.
6. Checks the result itself:
   - stops if Claude committed, changed nothing, touched a protected path (including through a rename), or changed
     more than 30 files or 1,500 lines;
   - runs the same checks as CI: backend restore, build, format and tests; frontend install, lint, tests and build.
     Any failure stops the run with nothing committed.
7. Commits (`feat: <title> (#n)` or `fix: …`).
8. Re-checks approval, eligibility and the weekly count. Anything changed: nothing is pushed.
9. If the change is **major** (by `dev-workflow.mjs`'s rules: migrations, auth, security, infrastructure or a large
   change), sends the Discord summary first. Without `DISCORD_WEBHOOK_URL`, or if sending fails, it stops before
   pushing.
10. Pushes and opens a **draft** PR into `release/0.3.0` with `Closes #n`, the check results, risks and outstanding
    work. The usual CI, branch policy, weekly limit and Discord notices apply when it's marked ready for review.

## When a run stops

Every stop says why, and nothing leaves the machine unless every step passed. The worktree and branch are kept for
inspection.

- Logs, the lock file and Claude's settings for the run are in `.git/claude-queue/` (never committed). Tokens and
  webhook URLs are removed from the logs.
- "Another queue run is in progress": if none is, delete `.git/claude-queue/run.lock` (scheduled runs clear a
  crashed run's lock themselves).
- A scheduled run that stopped keeps its branch, so the next hour moves on to the next issue instead of retrying.
  Fix the cause, discard the run (below), and it's picked up again.
- To discard a run: `git worktree remove ../parenthesis-claude-<n>` and `git branch -D feature/<n>-<slug>`.
- At the weekly limit with `--commit-only`: when the week resets, push the branch and open the draft PR by hand,
  following "Before opening a PR" in [the workflow guide](../development-workflow.md).

## When the release changes

When the next `release/x.y.z` is cut, update `ACTIVE_RELEASE` and `ACTIVE_MILESTONE` in the runner, the dry run's
default milestone, this runbook and the tests, in one reviewed PR.
