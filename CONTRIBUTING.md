# Contributing

## Workflow

### Branches
| Branch | Purpose | Changes through |
|---|---|---|
| `main` | What goes to the site. | A PR from `develop` (a release) or from `hotfix/…` only |
| `develop` | Integration branch for new work. | PRs from the branches below |
| `feature/…` | New features | Branch from `develop`, PR into `develop` |
| `bugfix/…`, `fix/…` | Bug fixes | Branch from `develop`, PR into `develop` |
| `chore/…`, `docs/…` | Tooling, CI, documentation | Branch from `develop`, PR into `develop` |
| `hotfix/…` | Urgent fix to the live site | Branch from `main`, PR into `main`, then merge `main` back into `develop` |

- `main` and `develop` are **protected**. Nobody can push to them directly, force-push or delete them, and that
  includes admins. Changes arrive only through PRs.
- **PR checks** must pass and the branch must be up to date with its target:
  - Backend: build, format and tests.
  - Frontend: lint, unit tests and production build.
  - API image: build and smoke test.
  - PRs into `main` also run **PR source**, which only accepts `develop` or `hotfix/…`.
  - PRs into `main` are also analysed by **SonarQube Cloud** for code quality and security, once it's connected
    (see [the runbook](docs/runbooks/sonarqube-cloud.md)).
- **Approvals:** none required. GitHub doesn't let authors approve their own PRs, and this is a single-maintainer
  project, so the passing checks are the gate.
- **Merging:** squash-merge into `develop`. Merge `develop` into `main` with a merge commit, so the release history
  is kept.
- **After every release or hotfix,** open a PR from `main` into `develop` (a back-merge). `main` requires PRs to be
  up to date with it, so `develop` must contain `main`'s merge commits before the next release.
- **SonarQube Cloud quality gate:** required on `main`. New code needs an A security, reliability and maintainability
  rating, at least 80% coverage, and little duplication.
- Keep PRs small: one backlog item (or one slice of it) per PR.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(calendar): add change-request endpoint`.
- Open work is tracked in [TODO.md](TODO.md).

## Definition of Done
- Builds with zero warnings (warnings are errors).
- New behaviour has unit and/or integration tests.
- Architecture decisions are recorded as an ADR in `docs/adr/`.
- No secrets in the repo. Use `dotnet user-secrets` locally and Key Vault in Azure.
- **Only synthetic data** in seeds, fixtures, screenshots and issues. Never real family or children's information.

## Code style
`.editorconfig` and the .NET analyzers are enforced at build time. Run `dotnet format` before pushing.
