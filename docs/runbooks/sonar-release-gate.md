# Release security gate (SonarQube Cloud)

Every production release PR into `main` (`develop` → `main`, or a `hotfix/…`) must pass the **Release security gate** check.
It blocks the release when SonarQube Cloud has security findings that aren't resolved, or that were accepted
without a written reason. Setup of SonarQube Cloud itself: [sonarqube-cloud.md](sonarqube-cloud.md).

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
`severity`, `status` and `resolution` fields are only a fallback when an answer lacks the new ones.

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

Run the gate's tests locally with `node --test .github/scripts/sonar-release-gate.test.mjs`. They use a fake
SonarQube Cloud API, so they need no token or network.

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
