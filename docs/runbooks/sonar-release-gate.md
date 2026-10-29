# Release security gate (SonarQube Cloud)

Every production release PR into `main` (`develop` → `main`, or a `hotfix/…`) must pass the **Release security gate** check.
It blocks the release when SonarQube Cloud has security findings that aren't resolved, or that were accepted
without a written reason. Setup of SonarQube Cloud itself: [sonarqube-cloud.md](sonarqube-cloud.md).

> **Since #373 (owner decision, October 29, 2026): SonarQube Cloud analyses `develop`, not `main`.** The Free plan
> analyses only the project's main branch and PRs into it, so that branch was renamed from `main` to `develop` in
> SonarQube Cloud. Where this page describes `main` being scanned, read the section
> [Develop is the analysed branch](#develop-is-the-analysed-branch-373), which takes precedence.

## How it works
The gate is the `release-gate` job in [`.github/workflows/sonar.yml`](../../.github/workflows/sonar.yml), after the
existing analysis. It doesn't scan the code again.

1. The **SonarQube Cloud** job analyses the PR's merge commit: what `main` will be once the release merges (the
   release candidate). The scanner reports the id of SonarQube Cloud's background task for that analysis.
2. The **Release security gate** job ([`.github/scripts/sonar-release-gate.mjs`](../../.github/scripts/sonar-release-gate.mjs))
   waits for that task to finish (up to 5 minutes), checks that it belongs to this project and this PR, and then
   reads the results through the SonarQube Cloud Web API.
3. It writes a report to the job summary: blocking findings, findings this release fixes, and warnings. Each one
   links to SonarQube Cloud.

The gate also runs after each merge into `main`. That run checks `main` itself and fails if anything blocking is
left, for example a finding the release was expected to fix.

## What fails a release
| Check | Blocks the release when |
|---|---|
| Quality gate | The quality gate of this exact analysis isn't **OK** (Sonar way: A ratings, 80% coverage on new code, all new hotspots reviewed, little duplication). `ERROR`, `WARN` and `NONE` all fail. |
| Vulnerabilities | Any unresolved issue of type **Vulnerability**, at any severity, in the release candidate or already on `main`. |
| Security issues | Any unresolved issue with a **Security** impact of **Blocker** or **High** severity, whatever its type. |
| Hotspots, new code | Any security hotspot in the PR's new code with status **To review**, at any probability. |
| Hotspots on `main` | Any hotspot already on `main` with status **To review** and **High** review priority. |
| Accepted findings | A security issue marked **Accepted** or **False positive**, or a hotspot reviewed as **Safe** or **Acknowledged**, with no comment explaining why. |
| Failing safely | Missing `SONAR_TOKEN` or `SONAR_PROJECT_KEY`, a skipped or failed analysis, an analysis for a different PR, a SonarQube Cloud error (after 2 retries for server errors), a timeout, or an answer the gate doesn't understand. |

Not blocking, but listed as warnings: security issues of **Medium**, **Low** or **Info** severity that aren't
vulnerabilities, and **Medium** or **Low** priority hotspots already on `main`. Sonar Sunday reviews those weekly.

### Severity model
The gate uses SonarQube Cloud's current model: each issue has **impacts** (software quality `SECURITY`,
`RELIABILITY` or `MAINTAINABILITY`, with severity `BLOCKER`, `HIGH`, `MEDIUM`, `LOW` or `INFO`) and an
**issueStatus** (`OPEN`, `CONFIRMED`, `ACCEPTED`, `FALSE_POSITIVE`, `FIXED`). There is no `CRITICAL` in this
model: the legacy `CRITICAL` corresponds to `HIGH`, `MAJOR` to `MEDIUM` and `MINOR` to `LOW`. The legacy `type`,
`severity`, `status` and `resolution` fields are only a fallback when an answer lacks the new ones. An
`issueStatus` the gate doesn't know counts as open, so a new status in SonarQube blocks rather than slipping through.
Severities are compared in the gate, not sent as filters, so it works whether or not SonarQube Cloud returns
`BLOCKER` and `INFO` impact severities.

Hotspots use their own model: **status** `TO_REVIEW` or `REVIEWED`, and when reviewed a **resolution** of `FIXED`,
`SAFE` or `ACKNOWLEDGED` (an accepted risk). Their **review priority** is `vulnerabilityProbability`: `HIGH`, `MEDIUM`
or `LOW`.

"Critical or high" therefore means `BLOCKER` or `HIGH` security impact. The gate is stricter for vulnerabilities:
every vulnerability blocks, because the seven in issue #65 are legacy `MAJOR`/`MINOR` (`MEDIUM`/`LOW`) and must
still be resolved or formally accepted before the next release (owner requirement, October 18, 2026).

### Findings already on `main`
SonarQube Cloud's PR analysis only reports findings in the PR's new code. Findings already on `main` are checked
too, otherwise old vulnerabilities would ship forever. A release that fixes one of them can't wait for `main` to be
re-analysed, so the gate compares the code: a finding on `main` counts as **fixed by this release** when its file is
deleted, or its flagged lines (whitespace ignored) no longer appear in the release candidate. Changing only
whitespace doesn't count. The post-merge run on `main` then confirms the finding closed; if it didn't, that run
fails and the finding is back on Sunday's list.

## Inspecting findings
- **From the failed check:** open the job and its **Summary**. Each blocking finding has a link straight to it.
- **In SonarQube Cloud:** <https://sonarcloud.io/project/issues?id=esaldivar_parenthesis&branch=main>. Filter by
  **Software quality → Security** and **Severity → Blocker, High**, or **Type → Vulnerability**. For a PR, pick the
  PR in the branch selector. Hotspots are under **Security Hotspots**.
- **Weekly:** the Sonar Sunday issue lists everything open on `main`.
- **While coding:** SonarQube for IDE in connected mode flags the same rules.

## Resolving a blocking finding
1. **Fix it** on a `fix/…` branch with a PR into the active `release/x.y.z` branch (or a `hotfix/…` into `main`
   when it can't wait for the next release window; see [the development workflow](../development-workflow.md)). Link the
   tracking issue (for example #65) in the PR.
2. **Or accept it, with a reason**, only if it's a false positive or a risk the owner deliberately accepts:
   - Issue: **Accept** (the risk is real but acceptable) or **False positive** (the rule is wrong here), and add a
     comment: why it's safe or accepted, who decided, and the link to the GitHub issue or PR.
   - Hotspot: **Safe** or **Acknowledged** (accepted risk), with the same kind of comment.
   - Only the owner accepts security findings. The comment is what the gate checks for; an empty one fails.
3. Re-run the **Sonar** workflow on the release PR (Actions → the run → **Re-run all jobs**), so the gate reads the
   new state.

Never mark a finding Accepted or False positive just to get a release out, and never change the gate, the rules or
the quality gate to make a PR pass. A policy change gets its own reviewed PR into the active release branch.

## Troubleshooting
| Message | What to do |
|---|---|
| `The SONAR_TOKEN secret isn't available` | Add or renew the repository secret (runbook step 3–4). PRs from forks never get secrets, so they can't be releases. |
| `The SONAR_PROJECT_KEY variable isn't set` | Add the repository variable (runbook step 4). |
| `The SonarQube Cloud analysis job didn't succeed (result: skipped)` | `SONAR_ORGANIZATION` isn't set. Result `failure`: fix the **SonarQube Cloud** job first (build, tests or scanner). |
| `didn't report a SonarQube Cloud task id` / `didn't write a report-task.txt` | The scanner's `end` step failed or changed its output. Check that job's log. |
| `HTTP 401` | The token is invalid or expired: generate a new one and update `SONAR_TOKEN`. |
| `HTTP 403` | The token's user lacks **Browse** on the project. |
| `HTTP 404` | Wrong project key, or the analysis was deleted. |
| `HTTP 400` | SonarQube Cloud rejected a parameter; its API may have changed. Update the script and its tests. |
| `HTTP 5xx`, `could not be reached`, `timed out`, `didn't finish processing` | SonarQube Cloud is slow or down (<https://status.sonarcloud.io>). Re-run the job later. |
| `The analysis is for PR #…, not PR #…` | An analysis of another PR was picked up. Re-run the whole workflow. |
| `Quality gate is ERROR` | Open the analysis link and fix the failing condition (for example new-code coverage). |
| `without a comment explaining why` | Add the justification comment to that finding in SonarQube Cloud, then re-run. |
| `didn't return its comments` | SonarQube Cloud answered without the finding's comment list, so the justification can't be checked. Re-run; if it persists, its API changed: update the script and its tests. |
| The **Release security gate** check never starts ("Expected — Waiting for status") | The Sonar workflow only starts when a PR into `main` is opened, reopened or pushed to. A PR retargeted to `main` afterwards hasn't run it: push the next commit, or close and reopen the PR. The check stays blocking meanwhile. |

Run the gate's tests locally with `node --test .github/scripts/sonar-release-gate.test.mjs`. They use a fake
SonarQube Cloud API, so they need no token or network. The answers in `.github/scripts/fixtures/sonar-release-gate/`
follow SonarQube's Web API response shapes; the seven vulnerabilities there use the keys, files and lines of the real
Sonar Sunday issue #56.

## API calls and how far they are verified
Checked October 18, 2026. SonarQube Cloud's own API pages (`sonarcloud.io/web_api`, `docs.sonarsource.com`) couldn't be
reached from the session that built this, so nothing below was run against the live API from there. "Proven" means
the Sonar Sunday workflow already made that call successfully against this project (issue #56).

| Call | Used for | Status |
|---|---|---|
| Token as Basic-auth user (`-u "$SONAR_TOKEN:"`) | Authentication | Proven by Sonar Sunday |
| `qualitygates/project_status` | Quality gate (`branch` proven; the gate uses `analysisId`) | Proven endpoint; `analysisId` per the Web API docs |
| `issues/search` with `resolved=false`, `types=VULNERABILITY` | Open vulnerabilities | Proven by Sonar Sunday. `types` is deprecated in favour of `impactSoftwareQualities` but still answers |
| `issues/search` with `impactSoftwareQualities=SECURITY`, `issueStatuses=ACCEPTED,FALSE_POSITIVE`, `additionalFields=comments` | Security impacts, accepted findings and their comments | Per the Web API docs and SonarSource community answers; first real run confirms |
| `hotspots/search` with `status=TO_REVIEW` | Hotspots to review | Proven by Sonar Sunday |
| `hotspots/search` with `status=REVIEWED&resolution=…`, then `hotspots/show` (`comment` list) | Reviewed hotspots' justification | Per the Web API docs; first real run confirms |
| `ce/task?id=` (`status`, `analysisId`, `pullRequest`, `componentKey`) | Waiting for this exact analysis | Per the Web API docs; first real run confirms |
| `.sonarqube/out/.sonar/report-task.txt` (`ceTaskId=`) | The analysis' task id, written by the .NET scanner | Default location; the workflow also searches `.sonarqube/` for it |

If any of these turns out different, the gate fails closed with the API's own message; it never passes by mistake.

## Required status check on `main`
The gate only blocks merges once it's a required check. Only the owner (repository admin) can set this.

1. Wait until this workflow has reached `develop` (through a release) and a PR into `main` has run it once, so the **Release security gate** check has run at least
   once (GitHub only offers checks it has seen).
2. **Settings → Branches →** the `main` protection rule **→ Edit** (or **Settings → Rules → Rulesets**, if `main`
   is protected by a ruleset). Only `main` needs it: the analysis only runs on PRs into `main`, so don't add it to
   `develop` or the `release branches` ruleset. Don't remove or loosen anything already there.
3. Under **Require status checks to pass before merging**, keep **Require branches to be up to date** on, search
   for **Release security gate**, and add it. If GitHub offers a source, choose **GitHub Actions**.
4. Keep the existing required checks: **PR source (main accepts develop or hotfix/\*)**, **SonarQube Cloud**,
   **SonarCloud Code Analysis**, and the CI checks.
5. Keep **Do not allow bypassing the above settings** (or "Include administrators") on, and give no one bypass
   permission.
6. Save, and confirm on the release PR that **Release security gate** shows as **Required**.

The job is named `Release security gate` in the workflow. Renaming it changes the check name, so update the
required check in the same change.

## Limitations
- The "fixed by this release" comparison is line-based: a fix made elsewhere (for example, validation added before
  the flagged line) still blocks until the finding is accepted with a reason or `main` is re-analysed. The post-merge
  run catches the opposite case (flagged lines changed but the finding stays).
- The PR's own workflow and gate script run from the PR branch, as all `pull_request` checks do. Changes to them
  are protected by review, not by the gate.
- The gate reads at most 10,000 results per search, SonarQube's own limit; more than that fails the gate.
- The gate checks that the analysis belongs to this PR, but SonarQube's task answer doesn't name the commit. The task
  id comes from the same workflow run, whose analysis checked out the PR's merge commit, and `main` requires PRs to be
  up to date, so that merge commit is what `main` becomes.

## Production deployment verification

`Deploy` runs `production-security.mjs` after the existing production environment approval and before Azure login,
reading the existing Sonar workflow through the job's `GITHUB_TOKEN` (`actions: read`). No extra Sonar credential,
service, subscription or scan is introduced. Development skips this step and retains its existing flow.

- Normal releases reuse the image tested on develop. Its OCI source repository and revision must be present; its
  Git tree must equal the current main candidate's tree. Hotfix images must satisfy the same rule.
- The verifier requires the latest **push to main** run of `.github/workflows/sonar.yml` for the candidate SHA.
  Both `SonarQube Cloud` and `Release security gate` must succeed in that run's current attempt, with matching
  SHA and repository. It waits at most 15 minutes for a pending/missing run, then fails closed. An older successful
  run cannot override a newer failure. Pagination, identity mismatches and unavailable API data fail closed.
- A manual production redeploy must run from main with `vX.Y.Z`. The version's Git tag must resolve to an ancestor
  of current main, the artifact must have that released candidate's tree, and its historical main Sonar evidence
  must pass the same verification. Older versions without retained evidence cannot be redeployed by this route.
- On success, `TARGET` becomes the inspected **digest**, used by migrations, deployment and release image tagging.
  The job summary links the Sonar run and records source/candidate revisions and the digest. A moved mutable tag
  cannot replace the verified artifact between this check and those steps.
- On failure, Azure login, migration, deployment and release tagging are skipped. Existing automatic recovery after
  a failed deployment restores the image already running before the attempt; it does not select a new manual
  rollback version or undo migrations. That recovery behavior is retained.

If verification fails, inspect the exact main Sonar run and fix its blocking findings or evidence/configuration.
Never substitute another SHA, remove the step, mark skipped analysis successful, or bypass approval. A release PR's
successful analysis is not a substitute for post-merge main evidence. This intentionally prevents deployment when
main's final analysis disagrees with the PR result. Re-run Deploy only after evidence is valid.

Local verification: `node --test .github/scripts/production-security.test.mjs .github/scripts/sonar-release-gate.test.mjs`
and `bash .github/scripts/production-plan.test.sh`. These use synthetic responses/temporary Git repositories and do
not deploy. Real GHCR provenance, Sonar API behavior, owner environment approval and required main rules must still
be evidenced on the reviewed rollout; local tests alone do not complete #66 or #65.

API references: [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs),
[workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs),
[Docker pull by digest](https://docs.docker.com/reference/cli/docker/image/pull/#pull-an-image-by-digest-immutable-identifier).

## Develop is the analysed branch (#373)

**Why.** On the Free plan SonarQube Cloud analyses one branch, the project's main branch, and PRs into it. Routine
fixes land on `develop`, so analysing GitHub's `main` reported stale code. The owner renamed SonarQube Cloud's main
branch from `main` to `develop` (October 29, 2026); renaming keeps its history and accepted-finding comments.

**What runs where** (`.github/workflows/sonar.yml`, `SONAR_PRIMARY_BRANCH: develop`):

| Event | SonarQube Cloud job | Release security gate |
|---|---|---|
| Push to `develop` | Full scan of `develop` | `develop`'s findings, post-merge rules |
| PR into `develop` (release, sync, hotfix) | PR analysis | New code in the PR plus findings already on `develop`, as described above (not a required check on `develop`) |
| PR into `main` (`develop` → `main`), push to `main` | No scan (the plan can't). Finds `develop`'s **latest** analysis and requires its commit's git tree to equal the release's | That analysis: quality gate, every open security issue on `develop`, hotspots (High blocks), justified acceptances. Fails if `develop` gets a newer analysis during the check |

So a release can only reuse results for **exactly the same code**. A PR into `main` is up to date with `main` (strict
check), so its merge commit is what `main` becomes; the gate compares that tree with `develop`'s analysed commit.
The new-code hotspot rule is covered by the quality gate (Sonar way requires new-code hotspots to be reviewed) and by
the gate on the release's PR into `develop`.

**Production deploys** keep the same evidence rule: the latest push-to-`main` run of `sonar.yml` for the candidate,
with both jobs successful. On `main` those jobs are the reuse check and the gate above.

**When the gate says the code isn't identical:**
- `main` has a commit `develop` doesn't (a past hotfix): merge `main` into `develop` with a `chore/sync-…` PR, wait for
  `develop`'s analysis, re-run.
- `develop` was just pushed and its analysis isn't finished: wait for the Sonar run on `develop`, re-run.
- **Hotfixes.** A `hotfix/…` PR straight into `main` can't match `develop`'s analysed code, so the gate blocks it.
  Fix on `develop` first (hotfix PR into `develop`), then release `develop` → `main`. If an urgent fix can't wait for
  that, it's an owner decision; the gate is never bypassed or edited to let it through.

**Owner checks after the rename:** in SonarQube Cloud **Administration → Branches and Pull Requests**, the main branch
reads `develop`, and there's no separate `main` branch left. The first push to `develop` after this change runs a full
scan; the next release PR into `main` should show "reusing `develop`'s analysis" in the **SonarQube Cloud** job.
