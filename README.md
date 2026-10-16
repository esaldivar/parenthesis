# Parenthesis

Parenthesis is a multi-tenant co-parenting app for separated parents: a shared calendar with PR-style mutual approvals, a family memory library with mutual deletion approval, and a safe, simple space for children.

**Stack:** Angular · ASP.NET Core (.NET 10) · PostgreSQL / EF Core · ASP.NET Core Identity · SignalR · Azure (Container Apps, Blob, Key Vault) · GitHub Actions · Docker

> Status: **Milestone 1 (foundation) in progress.** See the [Milestone 1 plan](docs/planning/milestone-1-plan.md).

## Quick start

Prerequisites:
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (pinned in `global.json`)
- Node.js (frontend, from PR 11)
- Docker Desktop, running

```bash
cp .env.example .env          # local-only settings; .env is git-ignored
docker compose up -d          # PostgreSQL 17, Azurite (blob), Mailpit (email)
docker compose ps             # all three should report "healthy"
# one-time: point the API at the local database (stored outside the repo via user-secrets)
dotnet user-secrets set "ConnectionStrings:Postgres" "Host=localhost;Port=5432;Database=coparent;Username=coparent;Password=<POSTGRES_PASSWORD from .env>" --project src/backend/CoParent.Api
dotnet build CoParent.slnx
dotnet run --project src/backend/CoParent.Api
dotnet test --solution CoParent.slnx   # unit + integration (integration tests start their own PostgreSQL container)
dotnet run --project src/backend/CoParent.Api -- migrate   # apply all module migrations, then exit
```

| Service | Address | Purpose |
|---|---|---|
| PostgreSQL | `localhost:5432` | Application database |
| Azurite | `http://localhost:10000` | Azure Blob Storage emulator |
| Mailpit | SMTP `localhost:1025`, UI http://localhost:8025 | Catches all outgoing email |

`docker compose down` stops the stack. Add `-v` to also delete the local data volumes.

With the API running (`http` profile port shown):

| Endpoint | Purpose |
|---|---|
| `GET http://localhost:5180/health/live` | Liveness: process is up (no dependency checks) |
| `GET http://localhost:5180/health/ready` | Readiness: PostgreSQL reachable; `503` otherwise |
| `http://localhost:5180/swagger` | Swagger UI (Development only) |
| `GET http://localhost:5180/openapi/v1.json` | OpenAPI document (Development only) |

Errors are returned as RFC 9457 `application/problem+json` with a `traceId`. Every response also carries a `trace-id` header that matches the `TraceId` in the server logs.

Database migrations and the Angular app are added in later Milestone 1 PRs; this section grows with them.

## Repository layout

```
docs/           architecture, ADRs, planning, runbooks
src/backend/    ASP.NET Core host, shared kernel, infrastructure, modules
src/frontend/   Angular workspace (PR 11)
tests/          unit + integration tests (xUnit v3, Testcontainers); architecture tests in PR 6
```

## Planning documents
- [Solution architecture & repository structure](docs/architecture/solution-architecture.md)
- [Database entity relationship design](docs/architecture/database-erd.md)
- Architecture Decision Records
  - [ADR-0001 Modular monolith](docs/adr/0001-modular-monolith.md)
  - [ADR-0002 Tenant isolation](docs/adr/0002-tenant-isolation.md)
  - [ADR-0003 Unified approval engine](docs/adr/0003-unified-approval-engine.md)
  - [ADR-0004 Cookie authentication](docs/adr/0004-cookie-authentication.md)
  - [ADR-0005 Protective "Restrict" path](docs/adr/0005-protective-actions.md)
- [Prioritized MVP backlog](docs/planning/mvp-backlog.md)
- [Milestone 1 development plan](docs/planning/milestone-1-plan.md)

## Contributing and security
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)

All demo data in this repository is synthetic.
