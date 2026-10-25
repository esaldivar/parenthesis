# Coding and release instructions

Read `CONTRIBUTING.md`, `SECURITY.md`, `CLAUDE.md`, applicable directory instructions and the accepted ADRs before editing. Preserve unrelated work. Branch ordinary changes from the active `release/x.y.z` branch and open focused PRs into it. Follow the PR template and list real tracking issues; intermediate fixes use `Refs #N`. Record unfinished acceptance in `TODO.md`.

Before opening or updating a production release PR (`develop` → `main`, or `hotfix/…` → `main`), inspect issue #65, the latest Sonar Sunday report, open main security findings/hotspots and the candidate's own Sonar analysis. Verify fixes in the candidate; do not assume a green quality gate resolves existing vulnerabilities. See `docs/runbooks/sonar-release-gate.md` for the overall-code policy and its limitations.

Resolve every blocking vulnerability/security finding, or obtain the owner's explicit acceptance with a reason recorded in SonarQube and the tracking issue. Never accept findings, bypass required checks or weaken the gate to make a release pass. Verify `Release security gate` is required on main and report missing branch-rule evidence instead of claiming a workflow alone enforces merges.

Production Deploy must verify the artifact source tree and the latest successful post-merge main Sonar analysis plus Release security gate for that exact candidate before Azure login, migrations or deployment. Manual production redeploys run from main and use a released version with matching historical evidence. Missing evidence blocks; never substitute another green revision or a PR-only run. Preserve owner environment approval and independent development deployment. Do not merge, deploy, activate paid services or change protection settings without appropriate owner authorization.

Run checks appropriate to each change and report exact results and limitations. UI checks include frontend lint/tests/build; backend checks include build/format/tests. For release/security scripts run their Node and shell tests and actionlint when available. Synthetic test evidence does not certify live Sonar, device or screen-reader acceptance.
