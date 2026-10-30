# Run Parenthesis locally

For the product overview, see the [root README](../../README.md). Other references are in the
[documentation index](../README.md).

The stack is Angular, ASP.NET Core (.NET 10), PostgreSQL / EF Core, ASP.NET Core Identity and SignalR.
Azure hosting uses Container Apps, Blob Storage and Key Vault; Docker and GitHub Actions support delivery.
See the [architecture](../architecture/solution-architecture.md) and [Azure runbook](../runbooks/azure-environments.md)
for the technical design and planned components.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (pinned in [`global.json`](../../global.json))
- Node.js 24 LTS or 26 ([`src/frontend/.nvmrc`](../../src/frontend/.nvmrc); Angular 22 needs ^24.15 or >=26)
- Docker Desktop, running

## Start local services and the API

Run from the repository root. The commands use a Bash-compatible shell; on PowerShell use
`Copy-Item .env.example .env` for the first command. Use only synthetic data.

```bash
cp .env.example .env          # local-only settings; .env is git-ignored
docker compose up -d          # PostgreSQL 17, Azurite (blob), Mailpit (email)
docker compose ps             # all three should report "healthy"
# one-time: point the API at the local database (stored outside the repo via user-secrets)
dotnet user-secrets set "ConnectionStrings:Postgres" "Host=localhost;Port=5432;Database=coparent;Username=coparent;Password=<POSTGRES_PASSWORD from .env>" --project src/backend/CoParent.Api
dotnet build CoParent.slnx
dotnet run --project src/backend/CoParent.Api -- migrate   # first run, and after pulling new migrations
dotnet run --project src/backend/CoParent.Api
```

Keep the API running. In a second terminal at the repository root:

```bash
dotnet test --solution CoParent.slnx   # unit + integration (integration tests start their own PostgreSQL container)
```

## Run the frontend

In another terminal at the repository root:

```bash
cd src/frontend
npm ci
npm start                     # http://localhost:4200, proxies /api to the API at https://localhost:7180 (run it too)
                              # dev builds only: http://localhost:4200/?sample=1 previews the dashboard with labelled sample data
```

| Service | Address | Purpose |
|---|---|---|
| PostgreSQL | `localhost:5432` | Application database |
| Azurite | `http://localhost:10000` | Azure Blob Storage emulator |
| Mailpit | SMTP `localhost:1025`, UI http://localhost:8025 | Catches all outgoing email |

`docker compose down` stops the stack. Add `-v` to also delete the local data volumes.

The port settings are in [`.env.example`](../../.env.example) and [`compose.yaml`](../../compose.yaml).
The API [launch profile](../../src/backend/CoParent.Api/Properties/launchSettings.json) uses HTTPS port 7180 and
HTTP port 5180. If needed, complete your platform's .NET development-certificate setup before proceeding.

The [frontend proxy](../../src/frontend/proxy.conf.json) sends `/api` to the API, so run both processes.
Register at `http://localhost:4200/register` and open the confirmation email in Mailpit at
`http://localhost:8025`. Sign-in requires a confirmed email.

In Docker and Azure, the API serves the built Angular app itself, keeping the session cookie on the same origin.
Sample dashboard mode is a labelled preview, not evidence that all displayed features are implemented.

## Checks and next steps

From the repository root (integration tests require Docker):

```bash
dotnet build CoParent.slnx
dotnet format CoParent.slnx --verify-no-changes
dotnet test --solution CoParent.slnx
```

In a separate terminal, from `src/frontend`:

```bash
npm run lint
npm test
npm run build
```

Frontend checks include ESLint template accessibility rules, Vitest, axe-core and theme-token contrast checks.
Automated checks do not replace actual device or screen-reader testing.

The frontend unit runner uses `vitest-base.config.mts` to cap Angular/jsdom workers at two
(one on hosts with at most two available cores). This keeps DOM rendering and axe scans from
starving each other on busy desktops. Test isolation, accessibility assertions and the default
five-second test timeout remain unchanged; `npm test` and `npm run test:watch` use the same cap.

Read [CONTRIBUTING.md](../../CONTRIBUTING.md) and [the development workflow](../development-workflow.md)
for checks appropriate to your change, the active release branch and PR requirements.
The [API reference](api-reference.md) covers health checks, OpenAPI, authentication and errors.
