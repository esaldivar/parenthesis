# ADR-0001: Modular monolith with one DbContext per module

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16

## Context
The product has clear sub-domains: families, calendar, approvals, memories, messaging and integrations. It has one small team, a modest expected load (thousands of families) and a cost-sensitive hosting budget. Approvals have to change calendar or memory state atomically.

## Decision
- Ship one deployable ASP.NET Core host. Each module is one project. Only its `Contracts` namespace is public.
- One PostgreSQL database with a **schema per module** and a **DbContext per module**. All contexts share one scoped `NpgsqlConnection`, so cross-module units of work can run in a single transaction.
- Modules talk through synchronous contract interfaces (queries, in-transaction steps) and domain events published through a transactional **outbox** (side effects).
- Boundaries are enforced by architecture tests (NetArchTest).

## Alternatives considered
- **Microservices.** Rejected: distributed transactions for approvals, operational cost, no scaling need.
- **Classic 4-project Clean Architecture (Domain/Application/Infrastructure/Api).** Rejected: it groups code by technical layer, so feature boundaries blur and they're hard to enforce.
- **Single global DbContext.** Simpler, but every module can then reach every table, and it defeats boundary tests.

## Consequences
- (+) A module could be extracted later (its schema and contracts are already separate).
- (+) Atomic approvals without sagas.
- (−) Several migration sets to manage. A small `migrate` CLI or startup step will apply them in a fixed order.
- (−) The shared-connection plumbing needs careful integration tests.
