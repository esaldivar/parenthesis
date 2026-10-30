# Contributing

## Workflow

### Branches
Milestone releases (owner decision, October 18, 2026). Full rules, release windows and deployment:
[the development workflow](docs/development-workflow.md).

| Branch | Purpose | Changes through |
|---|---|---|
| `main` | Production: real families use it. | A PR from `develop` (a tested release) or from `hotfix/…` only |
| `develop` | The private development site. Only tested milestone releases and hotfix syncs. | A PR from `release/x.y.z`, `hotfix/…` or `chore/sync-…` |
| `release/x.y.z` | One milestone (`release/0.2.0` = Milestone 2), cut from `develop`. One open at a time. | PRs from the work branches below |
| `feature/…`, `feat/…` | New features | Branch from the active release branch, PR into it |
| `bugfix/…`, `fix/…` | Bug fixes found during the milestone | Branch from the active release branch, PR into it |
| `chore/…`, `docs/…`, `design/…` | Tooling, CI, documentation, design handoffs | Branch from the active release branch, PR into it |
| `dependabot/…` | Dependency updates from the same repository | PR into the active `release/x.y.z`; normal review and checks apply |
| `hotfix/…` | Urgent fix to production | Branch from `main`, PR into `main`, then sync into `develop` and the active release branch |

- `main`, `develop` and `release/*` are **protected**. Nobody can push to them directly, force-push or delete them,
  and that includes admins. Changes arrive only through PRs.
- **PR checks** must pass and the branch must be up to date with its target:
  - Backend: build, format and tests.
  - Frontend: lint, unit tests and production build.
  - API image: build and smoke test.
  - **PR source** checks the source branch is allowed into the target (the table above).
  - **Release E2E gate** (PRs into `release/*`, and `release/*` → `develop`): merge only after the full
    Playwright matrix passes for every milestone so far against the PR merge candidate. Other PRs into
    `develop` pass it at once, without running Playwright
    (see [the runbook](docs/runbooks/playwright-release-gate.md)).
  - PRs into `main` are also analysed by **SonarQube Cloud** for code quality and security
    (see [the runbook](docs/runbooks/sonarqube-cloud.md)).
  - PRs into `main` also run the **Release security gate**, which blocks the release on unresolved vulnerabilities,
    high-severity security issues, unreviewed hotspots and accepted findings with no written reason. It fails if
    SonarQube Cloud can't be checked. See [the release security gate](docs/runbooks/sonar-release-gate.md).
- **Production artifact security:** after environment approval and before Azure login, Deploy verifies the image's
  immutable digest, source provenance and identical source tree against the latest successful post-merge `main`
  Sonar analysis and Release security gate. Missing, failed, skipped or stale evidence blocks normal releases,
  hotfixes and manual production redeploys. Redeploy production only from `main` using a released version.
  See the [runbook](docs/runbooks/sonar-release-gate.md#production-deployment-verification).
- **Approvals:** GitHub doesn't let authors approve their own PRs, and this is a single-maintainer project, so the
  passing checks are the gate for merging. **Production** additionally needs the owner's approval of each deployment,
  in the Actions tab (the `production` environment).
- **Merging:** squash-merge work branches into the release branch. Merge `release/x.y.z` into `develop`, and `develop`
  into `main`, with a **merge commit**: production deploys the image tested on `develop`, and the release version comes
  from the merged release branch, so both depend on keeping that history.
- **After every production release or hotfix,** back-merge `main` into `develop`: branch `chore/sync-main` from
  `develop`, run `git merge origin/main`, and PR it into `develop` with a **merge commit**. Then do the same into the
  active release branch (`chore/sync-develop` from it, `git merge origin/develop`), so the next release is up to date.
- **SonarQube Cloud quality gate:** required on `main`. New code needs an A security, reliability and maintainability
  rating, at least 80% coverage, and little duplication.
- **Weekly limits:** at most 3 PRs from `release/*` into `develop`, and separately 6 Copilot reviews a week
  (2 per PR). Ordinary feature/fix/docs/chore PRs and every other source/target combination do not consume the
  PR cap and must not be blocked by it (owner correction October 20, 2026). Discord notices for
  major and release PRs, and the Monday status report, are automatic. See
  [the development workflow](docs/development-workflow.md).
- Keep PRs focused: one backlog item (or one slice of it) per PR, and group closely related changes rather than
  opening PRs for minor ones.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(calendar): add change-request endpoint`.
- Open work is tracked in [TODO.md](TODO.md).

### Rhythm: Sonar Sunday and biweekly release windows
- **Every Sunday, Sonar Sunday:** `.github/workflows/sonar-sunday.yml` opens a **Week of <Sunday> Sonar findings**
  issue listing SonarQube Cloud's open vulnerabilities, bugs, security hotspots and major code smells on `develop`
  (owner decision, October 17, 2026).
  - A week with findings is queued for Claude (October 30, 2026): `claude-implementation`, the active release's
    milestone, and Project #2 as Ready For Development, P0 - Critical, Development. Claude only starts it after the
    owner reviews it and adds `owner-approved-claude`.
  - Fix them on `fix/sonar-sunday-<date>`, with a PR into the active release branch, and link it in the issue.
  - Work in order: vulnerabilities and bugs first, then hotspots, then code smells. A vulnerability that can't wait
    for the next release is a hotfix.
  - Anything deliberate is marked **Accepted** in SonarCloud, with a reason. The release security gate fails on an
    accepted security finding that has no comment.
- **Every other Friday, a production release window** (America/Chicago, from October 30, 2026; replaces Release
  Tuesday). `.github/workflows/release-window.yml` opens a checklist issue on the Monday of release week and tells
  Discord at each step. A window is an opportunity, not a deadline. See
  [release windows](docs/development-workflow.md#release-windows).
- Both run at 14:00 UTC and can also be run by hand from the Actions tab. GitHub only runs scheduled workflows from
  the default branch (`main`).

## Definition of Done
- Every PR lists its relevant real repository issues under **Tracking issues**, one `Refs #123` per line.
  This includes documentation, tooling, release rollups, hotfixes, syncs and bot PRs. PR-only references and
  examples do not count. Closed tracking issues can be reused for promotions; list the underlying work instead
  of inventing an unrelated issue. Use non-closing `Refs` on intermediate branches. A reference does not prove
  acceptance or deployment. See [the check and rollout instructions](docs/runbooks/pr-issue-links.md).
- A PR's milestone comes from its tracking issues (#140). The **PR milestone** report (report-only) says which one it
  inherits; when the issues disagree, have no milestone or point at another release, set the milestone yourself.
  Release, hotfix and sync PRs keep theirs. See [PR milestones](docs/runbooks/pr-issue-links.md#pr-milestones-140).
- Builds with zero warnings (warnings are errors).
- New behaviour has unit and/or integration tests.
- Architecture decisions are recorded as an ADR in `docs/adr/`.
- An architecture change updates its diagrams and documentation in the **same PR**: the
  [architecture at a glance](docs/architecture.md) and the
  [solution architecture](docs/architecture/solution-architecture.md).
- No secrets in the repo. Use `dotnet user-secrets` locally and Key Vault in Azure.
- **Only synthetic data** in seeds, fixtures, screenshots and issues. Never real family or children's information.

## Code style
`.editorconfig` and the .NET analyzers are enforced at build time. Run `dotnet format` before pushing.
