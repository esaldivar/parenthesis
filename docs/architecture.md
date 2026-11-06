# Architecture at a glance

Two diagrams for finding your way around: how a request flows through the running application, and how a change
gets from a work branch to production. The detailed design (modules, approvals, security model, decisions) lives
in the [solution architecture](architecture/solution-architecture.md), which stays the canonical technical
reference. The [database ERD](architecture/database-erd.md) covers the data model.

Solid lines are wired up today. Dashed lines are planned in the architecture but not used by the code yet.

## Runtime: from the browser to the database

```mermaid
flowchart LR
  User([Parent or child<br/>in a browser])

  subgraph ACA["Azure Container Apps: one container"]
    SPA[Angular SPA<br/>parent and kid shells<br/>served as static files]
    API[ASP.NET Core .NET 10 API<br/>cookie auth + antiforgery<br/>tenant gate on /api/families/…]
    MOD[Modules<br/>Identity · Families<br/>Approvals · Calendar · Memories]
  end

  PG[(Azure Database for PostgreSQL<br/>one schema per module)]
  KV[Azure Key Vault]
  MAIL[Email over SMTP<br/>Mailpit locally]
  AI[Application Insights]
  BLOB[(Azure Blob Storage)]
  GCAL[Google Calendar API]

  User -- HTTPS --> SPA
  SPA -- "same-origin /api<br/>HttpOnly cookie" --> API
  API --> MOD
  MOD -- EF Core --> PG
  MOD -- notices and invitations --> MAIL
  KV -. "connection string<br/>(Key Vault reference)" .-> ACA
  API -. "telemetry (not yet<br/>instrumented, #160)" .-> AI
  MOD -- "private event photos and avatars" --> BLOB
  MOD -- "one-way copy to each parent's own<br/>calendar, when set up (#386)" --> GCAL
```

- **One origin.** The API container serves the Angular build, so cookies stay HttpOnly and `SameSite=Strict`
  without CORS ([ADR-0004](adr/0004-cookie-authentication.md)).
- **Authorization happens on the server.** Every family route resolves the caller's membership before a module
  runs; hiding something in the UI is never the boundary ([ADR-0002](adr/0002-tenant-isolation.md)).
- **Secrets** reach the container app as Key Vault references through its managed identity
  ([Azure runbook](runbooks/azure-environments.md)).
- **Telemetry:** the API sends requests, dependencies and warning logs to Application Insights when
  `APPLICATIONINSIGHTS_CONNECTION_STRING` is set; no environment has it yet
  ([monitoring runbook, #86](runbooks/application-insights-monitoring.md)).

## Delivery: from a work branch to production

```mermaid
flowchart TB
  WB[Work branch<br/>feat/ fix/ docs/ chore/ design/]
  REL[release/x.y.z<br/>active milestone]
  DEV[develop]
  MAIN[main]
  DEVSITE[(Development site)]
  PROD[(Production)]

  WB -- "PR + owner merge (squash)" --> REL
  REL -- "release PR + owner merge" --> DEV
  DEV -- "release PR + owner approval" --> MAIN
  DEV -- "deploy on merge" --> DEVSITE
  MAIN -- "deploy the image tested on develop,<br/>after owner approval" --> PROD

  G1{{"Every PR: CI (backend, frontend, API image,<br/>security tests), PR source, tracking issue links"}}
  G2{{"Into release/* and release/* into develop:<br/>Playwright release gate"}}
  G3{{"Into develop: Sonar analysis and security gate<br/>Into main: identical-tree analysis verification"}}
  G4{{"Each deploy: migrations, smoke and health<br/>checks, automatic rollback on failure"}}
  G5{{"Into release/*:<br/>real Windows/NVDA website gate"}}

  G1 -.- WB
  G2 -.- REL
  G2 -.- WB
  G3 -.- DEV
  G5 -.- WB
  G4 -.- DEVSITE
  G4 -.- PROD
```

| Gate | Runs on | Workflow |
|---|---|---|
| CI: backend build, format and tests; frontend lint, Vitest and build; API image smoke test; release security tests | Every PR, and pushes to `main`, `develop` and `release/**` | [`ci.yml`](../.github/workflows/ci.yml) |
| PR source: which branch may merge into which | Every PR | [`pr-branch-policy.yml`](../.github/workflows/pr-branch-policy.yml) |
| Tracking issue links | Every PR | [`pr-issue-links.yml`](../.github/workflows/pr-issue-links.yml) |
| Playwright release candidate | Ready, same-repository work PRs into `release/*`, and `release/*` PRs into `develop`; the gate rejects missing, skipped or failed required runs | [`playwright-release.yml`](../.github/workflows/playwright-release.yml) ([runbook](runbooks/playwright-release-gate.md)) |
| Windows/NVDA website gate | Same-repository PRs into `release/*`, against the exact merge candidate | [`nvda-runner-probe.yml`](../.github/workflows/nvda-runner-probe.yml) ([runbook](runbooks/nvda-website-ci.md)) |
| SonarQube Cloud and release security gate | PRs into and pushes to `develop` receive analysis. PRs into and pushes to `main` require an identical source tree bound to the current develop analysis; missing or mismatched evidence fails | [`sonar.yml`](../.github/workflows/sonar.yml) ([runbook](runbooks/sonar-release-gate.md)) |
| Deploy, migrate, smoke test, roll back | Pushes to `develop` and `main`; manual rollback | [`deploy.yml`](../.github/workflows/deploy.yml) |

Branch rules, release windows and approvals are described in the [development workflow](development-workflow.md).
On November 5, 2026, API inspection confirmed required Playwright and NVDA gates on the release branch. With the
owner's explicit approval, `Release security gate` was added to main's required checks with its GitHub Actions
binding. Verification confirmed the existing checks, bindings, strict mode and other protection fields were
preserved. The remaining exact-candidate production evidence is tracked in
[#66](https://github.com/esaldivar/parenthesis/issues/66).

## Keeping this page current

An architecture change and its documentation ship in the **same PR**. That includes a new module, service,
external integration, data store, auth or tenant-isolation change, workflow gate or deployment step. Update the
diagrams on this page, the [solution architecture](architecture/solution-architecture.md) and, for a decision, an
[ADR](adr/). Check that the Mermaid blocks still render in GitHub's preview before asking for review.
