# Contributing

## Workflow
- Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Keep PRs small: one backlog item (or one slice of it) per PR.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(calendar): add change-request endpoint`.
- `main` is protected: PRs need green CI.

## Definition of Done
- Builds with zero warnings (warnings are errors).
- New behaviour has unit and/or integration tests.
- Architecture decisions are recorded as an ADR in `docs/adr/`.
- No secrets in the repo. Use `dotnet user-secrets` locally and Key Vault in Azure.
- **Only synthetic data** in seeds, fixtures, screenshots and issues. Never real family or children's information.

## Code style
`.editorconfig` and the .NET analyzers are enforced at build time. Run `dotnet format` before pushing.
