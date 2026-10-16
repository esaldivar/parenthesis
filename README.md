# Co-Parenting Family Platform (working name: Kinship)

A multi-tenant co-parenting app for separated parents: a shared calendar with PR-style mutual approvals, a family memory library with mutual deletion approval, and a safe, simple space for children.

**Stack:** Angular · ASP.NET Core (.NET 10) · PostgreSQL / EF Core · ASP.NET Core Identity · SignalR · Azure (Container Apps, Blob, Key Vault) · GitHub Actions · Docker

> Status: **Milestone 1 (foundation) in progress.** See the [Milestone 1 plan](docs/planning/milestone-1-plan.md).

## Quick start

Prerequisites:
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (pinned in `global.json`)
- Node.js 22 LTS (frontend, from PR 11)
- Docker Desktop (local PostgreSQL, Azurite and Mailpit, from PR 2)

```bash
dotnet build CoParent.slnx
dotnet run --project src/backend/CoParent.Api
```

Local infrastructure (`docker compose`), database migrations and the Angular app are added in later Milestone 1 PRs; this section grows with them.

## Repository layout

```
docs/           architecture, ADRs, planning, runbooks
src/backend/    ASP.NET Core host, shared kernel, infrastructure, modules
src/frontend/   Angular workspace (PR 11)
tests/          unit, integration and architecture tests (PR 4–6)
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
