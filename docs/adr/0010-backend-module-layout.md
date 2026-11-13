# ADR-0010: Backend module layout

- **Status:** Proposed with the persistence slice (#570).
- **Date:** 2026-11-12

## Context

The backend is a modular monolith (ADR-0001): `CoParent.Api` hosts seven module projects, each with one PostgreSQL
schema and one DbContext. Six modules already use `Contracts/`, `Domain/`, `Endpoints/` and `Infrastructure/`, but
their DbContexts sit directly in `Infrastructure/`, Messaging keeps `Realtime/` and `Transcripts/` at its root, and
Shared Records keeps every file at its root. The Approvals pilot (#572) moved one DbContext into
`Infrastructure/Persistence/` without schema or behavior changes. This record sets where each kind of code goes so
the remaining modules can move the same way, one focused PR at a time.

## Decision

Inside every `src/backend/Modules/CoParent.Modules.<Module>/` project:

```text
<Module>Module.cs              Dependency registration and route mapping
Contracts/                     Public interfaces and records other modules use
Domain/                        Entities, invariants and enums; no ASP.NET or EF Core
Application/<UseCase>/         Handlers, only where one can be extracted without changing behavior
Endpoints/                     Minimal API bindings, HTTP validation and responses
Infrastructure/                Adapters: email, Google clients, storage, departure handlers, cross-module bridges
Infrastructure/Persistence/    The module's DbContext (namespace ...Infrastructure.Persistence)
Infrastructure/Migrations/     Existing migrations, IDs and snapshot, in place for now
```

- **Namespaces follow folders.** A moved file takes the namespace of its new folder, and its users add the `using`.
- **Dependency direction:** Endpoints and Infrastructure may use Domain and Persistence; Domain uses neither.
  Modules talk only through another module's `Contracts/`. Host-wide middleware stays in `CoParent.Api`.
- **Persistence:** one DbContext per module, same schema, same registration and lifetime.
- **Migrations stay in `Infrastructure/Migrations/`** with their namespaces. EF Core finds them by their
  `[DbContext]` and `[Migration]` attributes, not their folder, so moving the DbContext leaves migration IDs, the
  snapshot and `__EFMigrationsHistory` unchanged. Moving the migrations themselves waits until an upgrade of an
  existing database can be shown on disposable PostgreSQL (not available on every workstation).
- **Application layer:** endpoints keep their logic until a use case can move out with no behavior change; then it
  goes to `Application/<UseCase>/`. Folder moves come first.
- **Tests:** `tests/CoParent.IntegrationTests` already has `Api/`, `Infrastructure/` and `Persistence/`; test files
  stay there and can be grouped by module later. `CoParent.UnitTests` and `CoParent.ArchitectureTests` keep their
  layout.

## Inventory and move map

| Module | Today | Move |
| --- | --- | --- |
| Approvals | DbContext in `Infrastructure/Persistence/` (#572) | Done. `ChangeRequests`, `RequestExpiry` and `ApprovalsDeparture` are adapters and stay in `Infrastructure/`. |
| Calendar | `Infrastructure/CalendarDbContext.cs`; `CalendarToday.cs` at the root | **Persistence slice:** DbContext → `Infrastructure/Persistence/`. **Folders slice:** `CalendarToday` → `Domain/` (it uses only `TimeProvider` and `EventSchedule`). |
| Families | `Infrastructure/FamiliesDbContext.cs`; PDF renderers (`AllergyPdf`, `MedicationPdf`) in `Endpoints/` | **Persistence slice:** DbContext → `Infrastructure/Persistence/`. **Folders slice:** PDF renderers → `Infrastructure/Pdf/`. |
| Identity | `Infrastructure/IdentityModuleDbContext.cs` | **Identity slice**, in its own PR (auth code): DbContext → `Infrastructure/Persistence/`. `UserDirectory` and the other adapters stay in `Infrastructure/`. |
| Memories | `Infrastructure/MemoriesDbContext.cs` | **Persistence slice:** DbContext → `Infrastructure/Persistence/`. |
| Messaging | `Infrastructure/MessagingDbContext.cs`; `Realtime/` and `Transcripts/` at the root | **Persistence slice:** DbContext → `Infrastructure/Persistence/`. **Folders slice:** `ChatHub` (the SignalR boundary) → `Endpoints/`, the notifier and origin check → `Infrastructure/Realtime/`, transcript building and PDF → `Infrastructure/Transcripts/`. |
| Shared Records | Every file at the root, migrations in `Migrations/` | **Shared Records slice:** entities (split out of the DbContext file) → `Domain/`, `RecordEndpoints` → `Endpoints/`, DbContext → `Infrastructure/Persistence/`, export, PDF, attachments, the fund approval handler, cleanup and departure → `Infrastructure/`. The model snapshot carries the entities' new type names. Later: migrations → `Infrastructure/Migrations/` only with the upgrade check above. |

Each slice is move-only: no route, request, response, validation, DI lifetime, tenant filter, auth policy,
antiforgery or transaction change, and `dotnet ef migrations has-pending-model-changes` reports no changes for every
moved DbContext. Progress is tracked in [TODO.md](../../TODO.md).

Known exceptions to the dependency direction, left as they were because removing them changes more than folders:
`MedicationPdf` renders the `MedicationEntry` API record from `Endpoints/`, and Messaging's `ChatNotifier` and
`HubOriginCheck` use the hub and message views in `Endpoints/`. A later change can move those shared records into
`Contracts/` or `Domain/` if a module needs the boundary enforced.
