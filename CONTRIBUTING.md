# Contributing

## Workflow

### Branches
| Branch | Purpose | Changes through |
|---|---|---|
| `main` | What goes to the site. | A PR from `develop` (a release) or from `hotfix/…` only |
| `develop` | Integration branch: stabilized milestone releases only. | A PR from `release/…` (gated by Playwright), `hotfix/…`, or the `chore/sync-main` back-merge only |
| `release/…` | The active milestone's release candidate, e.g. `release/0.3.0` | Branch from `develop`; the work branches below PR into it; then a PR into `develop` |
| `feature/…` | New features | Branch from the active release branch, PR into it |
| `bugfix/…`, `fix/…` | Bug fixes | Branch from the active release branch, PR into it |
| `chore/…`, `docs/…`, `design/…` | Tooling, CI, documentation, design handoffs | Branch from the active release branch, PR into it |
| `hotfix/…` | Urgent fix to the live site | Branch from `main`, PR into `main`, then merge `main` back into `develop` |

- `main` and `develop` are **protected**. Nobody can push to them directly, force-push or delete them, and that
  includes admins. Changes arrive only through PRs.
- **PR checks** must pass and the branch must be up to date with its target:
  - Backend: build, format and tests.
  - Frontend: lint, unit tests and production build.
  - API image: build and smoke test.
  - Every PR runs **PR source**, which checks the source branch against the target: `main` only accepts `develop` or
    `hotfix/…`; `develop` only accepts `release/…`, `hotfix/…` and `chore/sync-main`; `release/…` accepts `develop`,
    hotfixes and the work branches.
  - **Release E2E gate** (PRs into `develop`): a `release/…` PR merges only after the Playwright suite passes for every
    milestone so far, run against the release candidate itself. Other PRs pass it at once, without running Playwright. See [the runbook](docs/runbooks/playwright-release-gate.md).
  - PRs into `main` are also analysed by **SonarQube Cloud** for code quality and security, once it's connected
    (see [the runbook](docs/runbooks/sonarqube-cloud.md)).
- **Approvals:** none required. GitHub doesn't let authors approve their own PRs, and this is a single-maintainer
  project, so the passing checks are the gate. For a release PR, **the owner merging it is the approval**: nobody else
  merges a `release/…` PR (owner decision, October 18, 2026).
- **Milestone releases:** cut `release/<version>` from `develop` (one at a time, for the active milestone), land the
  milestone's feature, fix, chore and docs PRs in it, then open `release/<version>` → `develop`. Playwright runs on that PR; a failure blocks the merge until the underlying
  issue is fixed on the release branch. Never skip, disable or delete a test to get a release through.
- **Merging:** squash-merge work PRs into the release branch; merge `release/…` into `develop` with a merge commit. Merge `develop` into `main` with a merge commit, so the release history
  is kept.
- **After every release or hotfix,** back-merge `main` into `develop`: branch `chore/sync-main` from `develop`, run
  `git merge origin/main`, and PR it into `develop` with a **merge commit**. `main` requires PRs to be up to date, so
  `develop` must contain `main`'s merge commits before the next release. A PR straight from `main` doesn't work,
  because `develop` requires PRs to be up to date too.
- **SonarQube Cloud quality gate:** required on `main`. New code needs an A security, reliability and maintainability
  rating, at least 80% coverage, and little duplication.
- **Weekly limits:** at most 3 new development PRs and 6 Copilot reviews a week (2 per PR). Discord notices for
  major and release PRs, and the Monday status report, are automatic. See
  [the development workflow](docs/development-workflow.md).
- Keep PRs focused: one backlog item (or one slice of it) per PR, and group closely related changes rather than
  opening PRs for minor ones.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(calendar): add change-request endpoint`.
- Open work is tracked in [TODO.md](TODO.md).

### Weekly rhythm: Sonar Sunday and Release Tuesday
Code-quality findings are reviewed every week, so they don't pile up into technical debt (owner decision, October 17,
2026).
- **Sunday, Sonar Sunday:** `.github/workflows/sonar-sunday.yml` opens a **Sonar Sunday** issue listing SonarQube
  Cloud's open vulnerabilities, bugs, security hotspots and major code smells on `main`.
  - Fix them on `fix/sonar-sunday-<date>`, with a PR into the active release branch, and link it in the issue.
  - Work in order: vulnerabilities and bugs first, then hotspots, then code smells.
  - Anything deliberate is marked **Accepted** in SonarCloud, with a reason.
- **Tuesday, Release Tuesday:** `.github/workflows/release-tuesday.yml` opens a **Release Tuesday** checklist when
  `develop` has changes that `main` doesn't.
  - Open the `develop` → `main` PR and merge it once every check, including the quality gate, is green.
  - Then back-merge into `develop`.
- Both run at 14:00 UTC and can also be run by hand from the Actions tab. GitHub only runs scheduled workflows from
  the default branch (`main`).

## Definition of Done
- Builds with zero warnings (warnings are errors).
- New behaviour has unit and/or integration tests.
- Architecture decisions are recorded as an ADR in `docs/adr/`.
- No secrets in the repo. Use `dotnet user-secrets` locally and Key Vault in Azure.
- **Only synthetic data** in seeds, fixtures, screenshots and issues. Never real family or children's information.

## Code style
`.editorconfig` and the .NET analyzers are enforced at build time. Run `dotnet format` before pushing.
