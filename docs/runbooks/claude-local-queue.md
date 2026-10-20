# Local Claude queue

Runs one owner-approved coding issue with Claude Code **on the owner's machine**, signed in with the owner's Claude
subscription, and opens a **draft** PR into the active release branch (owner decision, October 19, 2026; issue #94).
It's **fully automated**: a Windows scheduled task checks every hour while the owner is signed in to the PC (owner
decision, October 19, 2026), so approving an issue is all it takes. No Claude credential is stored in GitHub, and no
Claude runs in GitHub Actions. It never merges, deploys or changes labels. It does keep the board's **Status** in
step with the work (owner decision, October 19, 2026; see "The project board" below).

| | |
|---|---|
| Runner | [`scripts/claude_queue_run.py`](../../scripts/claude_queue_run.py) |
| Selection | [`scripts/claude_queue_select.py`](../../scripts/claude_queue_select.py) (also used by the read-only **Claude Queue Dry Run** workflow) |
| Approval check | [`scripts/claude_queue_approval.py`](../../scripts/claude_queue_approval.py) |
| Board sync | [`scripts/claude_queue_board.py`](../../scripts/claude_queue_board.py) |
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
- `gh auth login` as the owner, with write access to projects for the board sync: `gh auth refresh -s project`.
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
- does nothing when no issue is waiting or another run is going. The weekly cap applies only to `release/*` →
  `develop` promotions; it never blocks this runner's feature/bugfix work into the active release branch. Idle checks leave no log;
- writes one line to `.git/claude-queue/last-scheduled-run.txt` every time (when, and idle, stopped or finished), so
  you can confirm the hourly runs are happening;
- moves the issue to **In Development** when it starts and **Awaiting PR Approval** when the draft PR opens;
- sends one Discord line when it opens a draft PR, and one when it stops on a problem. The same problem isn't
  reported again every hour; a different one is;
- clears the lock left by a run that crashed or was killed.

Your PC must be on and you signed in; runs missed while it was off start as soon as it's back. Docker must be running
for the backend tests.

## What a run does

1. Checks that `gh` is signed in as the owner, Claude Code is signed in with the subscription, and no other run is in
   progress (lock file).
2. Selects the issue and verifies the owner's approval (above).
3. Applies the weekly cap only for a `release/*` source targeting `develop`. This runner generates feature/bugfix
   PRs into `release/0.3.0`, so it does not query that cap or stop coding when release promotion slots are exhausted.
   Owner coding approval, eligibility, one-task lock and all other guards remain required.
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
8. Re-checks approval and eligibility. The same source-and-target guard protects the pre-PR count: ordinary work
   stays exempt even if all promotion slots were used while Claude ran. Failed approval/eligibility: nothing pushed.
9. If the change is **major** (by `dev-workflow.mjs`'s rules: migrations, auth, security, infrastructure or a large
   change), sends the Discord summary first. Without `DISCORD_WEBHOOK_URL`, or if sending fails, it stops before
   pushing.
10. Pushes and opens a **draft** PR into `release/0.3.0` with `Refs #n` in Tracking issues, the check results, risks and outstanding
    work. The usual CI, branch policy and Discord notices apply when it's marked ready for review; the promotion
    cap does not apply to this source/target pair.

## The project board

Every scheduled run first syncs Project #2, then looks for work. Any **open** issue on the project that a PR links
with "Closes #n" (or Fixes/Resolves) at the start of a line, bullet or sentence moves like this:

| Status | When |
|---|---|
| In Development | A queue run starts on it (set by the run itself) |
| Awaiting PR Approval | Its PR is open as a draft (the queue's draft PR, or a PR moved back to draft) |
| Code Review | Its PR is marked ready for review |
| Awaiting Deployment | The PR is merged but the work isn't on `main` yet (`release/x.y.z`, then `develop`, then `main`) |
| Done | The merged work is on `main`; the issue is also **closed** |
| Backlog | Every PR for it was closed without merging |

- An open follow-up PR puts an issue back in review even after an earlier PR merged.
- A card only moves when what its PRs say changes, so if you move one by hand it stays there until its PRs change
  again. What the PRs said at the last sync is kept in `.git/claude-queue/board-state.json`.
- "Follow-up to #94" or "...and close #65 later" don't link an issue; only a closing keyword that starts a line,
  bullet or sentence does.
- Updates land within the hour (it's the hourly task), and only while your PC is on.
- Discord gets **one message per scheduled run** listing every card it moved (issue number, title, old → new
  status, and "issue closed" at Done), including the queue's own moves. Nothing is sent when nothing moved. On a
  release day expect one longer message as that release's issues reach Done.
- Preview without changing anything: `python scripts/claude_queue_run.py --board-plan`.
- If the board can't be updated (for example `gh` lacks the project scope), the run says so once on Discord and
  carries on with the queue; the card catches up on the next run that succeeds.

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
- `--commit-only` remains an explicit manual no-push/no-PR option. Ordinary work is no longer forced into it by
  a promotion allowance; follow "Before opening a PR" in [the workflow guide](../development-workflow.md).

## October 20 policy rollout (#134)

The broad development-PR cap is superseded. Merge the reviewed correction into the active release branch before
refreshing installed queue code; get the reviewed policy onto default branch `main` through owner-approved merges
so default-branch PR checks and the weekly report use it. Main currently lacks the weekly-limit workflow; no hosted
cap enforcement is claimed. Only require Weekly PR limit on develop after the corrected default-branch workflow
has demonstrated pass/fail behavior. Preserve all required checks and owner approvals. The installed task refreshes
its checkout from the remote active release at the beginning of each scheduled run, so editing that checkout alone
is temporary and could be overwritten. Removing the old limit can allow already-approved #98 to run at the next
hour: coordinate explicit activation before applying unreviewed live edits. Do not start the task to validate this.

## When the release changes

When the next `release/x.y.z` is cut, update `ACTIVE_RELEASE` and `ACTIVE_MILESTONE` in the runner, the dry run's
default milestone, this runbook and the tests, in one reviewed PR.
