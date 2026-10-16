# Milestone 1 — Foundation (walking skeleton)

**Goal:** a parent can register, confirm their email, log in, create a family and see it in an Angular shell. Every request is tenant-scoped and proven isolated by tests. CI is green on every PR.

**Estimated effort:** ~2 weeks part-time, as 12 small PRs.
**Out of scope:** invitations, child accounts, calendar, uploads, Azure deployment (all in M2–M5).

## Definition of Done (every PR)
- Builds with zero warnings (`TreatWarningsAsErrors`). Lint passes.
- New behaviour has unit and/or integration tests. CI is green. Test results are reported as they actually are; nothing is claimed as passing until CI shows it.
- No secrets in the repo: user-secrets locally, Key Vault in Azure. `.env.example` only.
- Only synthetic data in seeds, fixtures and screenshots.
- An ADR is added or updated if the PR makes an architectural decision.

## Work breakdown (in merge order)

| # | PR | Backlog | Acceptance criteria |
|---|---|---|---|
| 1 | **Repo scaffold** | F-01 | `CoParent.slnx`, central package management, nullable + analyzers on, `.editorconfig`, `.gitignore`, README with the goal and a quick-start placeholder, docs folder (this plan + ADRs). |
| 2 | **Local dev environment** | F-02 | `docker compose up` starts PostgreSQL 17, Azurite and Mailpit with healthchecks. `.env.example` documents the variables. |
| 3 | **API host skeleton** | F-03 | `/health/live` and `/health/ready` (DB check). OpenAPI at `/openapi/v1.json`, Swagger UI in Development. Global ProblemDetails. Serilog/OTel console logging with correlation IDs. |
| 4 | **SharedKernel + persistence plumbing** | F-04 | `Entity`, `IFamilyScoped`, UUIDv7 IDs, `TimeProvider`. A scoped shared `NpgsqlConnection` + `IUnitOfWork` spanning module contexts. A migration runner that applies module migrations in a fixed order (`dotnet run -- migrate`). |
| 5 | **Test harness** | F-05 | PostgreSQL Testcontainers fixture already exists (PR 4). Add a `WebApplicationFactory` harness, Respawn reset between tests, and API tests for health + the 500 ProblemDetails path. |
| 6 | **Architecture tests** | F-06 | Fails if a module references another module's non-`Contracts` types, or if an `IFamilyScoped` entity has no query filter. |
| 7 | **CI pipeline** | F-07 | `ci.yml` on PRs and `main`: restore → build → unit + integration tests (Docker available on ubuntu runners) → frontend lint/test/build → docker image build (no push). Caches NuGet and npm. |
| 8 | **Identity: register / login / logout** | A-01, A-03 | `POST /api/auth/register`, `/login`, `/logout`. HttpOnly + `SameSite=Strict` cookie. Antiforgery on unsafe verbs. Lockout after 5 failures. Rate limit on auth routes. Tests: happy path, wrong password, lockout, CSRF rejected. |
| 9 | **Email confirmation + password reset** | A-02 | Confirmation link via Mailpit. Login is blocked until confirmed. Reset flow doesn't reveal whether an account exists. Tests check the email body through the Mailpit API or a fake sender. |
| 10 | **Families + tenant gate** | FM-01, FM-02 | `POST /api/families` (the creator becomes Parent), `GET /api/me/families`, `GET /api/families/{id}`. Endpoint filter populates `ITenantContext`. Query filter + SaveChanges guard. **Cross-tenant tests: a user from family B gets 404 on family A's resources.** Family creation is audit-logged. |
| 11 | **Angular workspace + shell** | F-08 | Standalone app, lazy routes, Material theme (light/dark, accessible contrast), parent shell with the main navigation (Dashboard, Calendar, Children, Memories, Messages, Approvals, Settings; unbuilt sections show a "coming soon" empty state). Dev proxy for `/api` and `/hubs`. API client generated from OpenAPI. |
| 12 | **Angular auth + family onboarding** | A-04 | Register, login, check-email and confirm pages. An auth signal store backed by `/api/me`. Route guards. A "create your family" onboarding step leading to an empty dashboard. Vitest unit tests for the store and guards. One keyboard-only walkthrough of the flow is recorded in the PR. |

Outbox (F-09) and audit (F-10) start in M1 only as far as PR 10 needs them, as a minimal synchronous audit write. Both are completed early in M2.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Shared connection across DbContexts is fiddly | Prove it in PR 4 with an integration test that commits two contexts atomically and rolls both back on failure. |
| Testcontainers slow in CI | Start one container per test run and reset with Respawn, not one per test. |
| .NET 10 / Angular package incompatibilities | Pin versions in central package management. Dependabot opens grouped weekly PRs. |
| Scope creep into M2 | Invitations and child accounts are explicitly excluded above. |

## Demo at the end of M1
1. `docker compose up` → `dotnet run` → `npm start`.
2. Register "Alex Rivera" (synthetic) → confirm through Mailpit → log in.
3. Create the family "Rivera Family" → land on the dashboard shell.
4. Show the Swagger UI, a green CI run, and the cross-tenant test suite.
