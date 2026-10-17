# Parenthesis

![Parenthesis logo concept — two parenthesis-shaped caregivers embracing a smiling child](docs/design/assets/parenthesis-logo-concept.svg)

> **Brand preview:** This is a provisional vector interpretation of the approved logo direction; final production artwork is pending visual review.

[![CI](https://github.com/esaldivar/parenthesis/actions/workflows/ci.yml/badge.svg)](https://github.com/esaldivar/parenthesis/actions/workflows/ci.yml)

Parenthesis is a multi-tenant co-parenting app for separated parents: a shared calendar with PR-style mutual approvals, a family memory library with mutual deletion approval, and a safe, simple space for children.

**Stack:** Angular · ASP.NET Core (.NET 10) · PostgreSQL / EF Core · ASP.NET Core Identity · SignalR · Azure (Container Apps, Blob, Key Vault) · GitHub Actions · Docker

> Status: **Milestone 1 (foundation) in progress.** See the [Milestone 1 plan](docs/planning/milestone-1-plan.md).

## Quick start

Prerequisites:
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (pinned in `global.json`)
- Node.js 24 LTS or 26 (`src/frontend/.nvmrc`; Angular 22 needs ^24.15 or >=26)
- Docker Desktop, running

```bash
cp .env.example .env          # local-only settings; .env is git-ignored
docker compose up -d          # PostgreSQL 17, Azurite (blob), Mailpit (email)
docker compose ps             # all three should report "healthy"
# one-time: point the API at the local database (stored outside the repo via user-secrets)
dotnet user-secrets set "ConnectionStrings:Postgres" "Host=localhost;Port=5432;Database=coparent;Username=coparent;Password=<POSTGRES_PASSWORD from .env>" --project src/backend/CoParent.Api
dotnet build CoParent.slnx
dotnet run --project src/backend/CoParent.Api -- migrate   # first run, and after pulling new migrations
dotnet run --project src/backend/CoParent.Api
dotnet test --solution CoParent.slnx   # unit + integration (integration tests start their own PostgreSQL container)

cd src/frontend
npm ci
npm start                     # http://localhost:4200, proxies /api to the API at https://localhost:7180 (run it too)
npm run lint && npm test       # ESLint (incl. template accessibility rules); Vitest + axe-core + token contrast
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
| `GET /api/antiforgery` | Issues the `XSRF-TOKEN` cookie; send it back as `X-XSRF-TOKEN` on POST/PUT/PATCH/DELETE |
| `POST /api/auth/register`, `/login`, `/logout` | Cookie sign-in (rate limited; ADR-0004). Sign-in needs a confirmed email |
| `POST /api/auth/confirm-email`, `/resend-confirmation`, `/forgot-password`, `/reset-password` | Email confirmation and password reset. Emails appear in Mailpit at http://localhost:8025 |
| `GET /api/me` | The signed-in user |
| `POST /api/families`, `GET /api/me/families` | Create a family (you become a parent); list your families |
| `GET /api/families/{familyId}` | Family details and members. Non-members get `404`, as if it didn't exist |

Errors are returned as RFC 9457 `application/problem+json` with a `traceId`. Every response also carries a `trace-id` header that matches the `TraceId` in the server logs.

In Docker and Azure the API serves the built Angular app itself (same origin, so the session cookie never crosses origins). Locally, register at http://localhost:4200/register and open the confirmation email in Mailpit.

## Repository layout

```
docs/           architecture, ADRs, planning, runbooks
src/backend/    ASP.NET Core host, shared kernel, infrastructure, modules
src/frontend/   Angular 22 app: parent and child shells, design tokens (see docs/design-system.md)
tests/          unit, integration (xUnit v3, Testcontainers) and architecture tests
```

## Design and branding

- [Design handoff index](docs/design/README.md) (start here)
- [Visual design system](docs/design-system.md)
- [Brand identity and logo usage](docs/design/BRANDING.md)
- [Page design planning](docs/design/PAGE_DESIGNS.md)

The logo uses a neutral, abstract child figure and a two-tone wordmark: sage **Parent** and charcoal **hesis** (ivory **hesis** in dark mode). In the app it is the reusable `app-logo` component (`src/frontend/src/app/shared/brand/logo.ts`). Detailed styling guidance lives in the linked documents to keep this README focused on the project and setup.

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
