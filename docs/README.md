# Parenthesis documentation

Start with the [product overview](../README.md). This index points to canonical guides; architecture,
specifications and decisions stay in their existing locations.

## Develop and contribute

- [Getting started](development/getting-started.md) — local prerequisites, services, startup and checks.
- [API reference](development/api-reference.md) — API discovery, foundational endpoints and errors.
- [Contributing](../CONTRIBUTING.md) — required checks and contribution conventions.
- [Development workflow](development-workflow.md) — branches, releases, environments and review policy.
- [Code review standards](development/CODE_REVIEW_STANDARDS.md).
- [Security policy](../SECURITY.md) — private vulnerability reporting.

## Architecture and decisions

- [Architecture at a glance](architecture.md): runtime and delivery flow diagrams.
- [Solution architecture and repository structure](architecture/solution-architecture.md).
- [Database entity relationship design](architecture/database-erd.md).

Accepted Architecture Decision Records (ADRs):

| Decision | Subject |
| --- | --- |
| [ADR-0001](adr/0001-modular-monolith.md) | Modular monolith and one DbContext per module |
| [ADR-0002](adr/0002-tenant-isolation.md) | Family tenant isolation |
| [ADR-0003](adr/0003-unified-approval-engine.md) | Shared approval engine |
| [ADR-0004](adr/0004-cookie-authentication.md) | Same-origin cookie authentication |
| [ADR-0005](adr/0005-protective-actions.md) | Immediate protective Restrict actions |
| [ADR-0006](adr/0006-profiles-pins-and-child-devices.md) | Profiles, child PINs, devices and mutual approval |

## Product plans and design

- [Prioritized backlog and release map](planning/mvp-backlog.md).
- [Milestone 1 foundation plan](planning/milestone-1-plan.md) — original implementation plan, retained for reference.
- [Open and deferred work](../TODO.md).
- [Design handoff index](design/README.md), [visual design system](design-system.md), and
  [page design planning](design/PAGE_DESIGNS.md).
- [Brand identity](design/BRANDING.md) and [approved asset manifest](design/assets/APPROVED_ASSET_MANIFEST.md).
- [Design handoffs and specifications](design/handoffs/README.md), including
  [calendar decisions](design/CALENDAR_DECISIONS.md) and
  [M3 acceptance verification](design/handoffs/M3_CALENDAR_ACCEPTANCE_VERIFICATION.md).

The approved transparent icon is available for reuse. Horizontal wordmark exports still need correction and
verification; do not substitute the provisional concept or treat design mockups as shipped screenshots.

## Operations, quality and releases

- [Azure environments](runbooks/azure-environments.md).
- [SonarQube Cloud](runbooks/sonarqube-cloud.md) and the [release security gate](runbooks/sonar-release-gate.md).
- [Playwright release gate](runbooks/playwright-release-gate.md).
- [PR issue-link requirements](runbooks/pr-issue-links.md).
- [Local queue](runbooks/claude-local-queue.md) and [owner-testing rollout](runbooks/claude-owner-testing.md).
- [Screen-reader prerequisites](runbooks/screen-reader-prerequisites.md).
- Release notes: [v0.2.0](releases/v0.2.0.md) and [v0.3.0 draft](releases/v0.3.0.md).

## Where code lives

| Path | Contents |
| --- | --- |
| [`src/backend/`](../src/backend/) | ASP.NET Core host, shared kernel, infrastructure and modules |
| [`src/frontend/`](../src/frontend/) | Angular app, parent/child shells and design tokens |
| [`tests/`](../tests/) | Backend unit, integration and architecture tests, plus workflow tests |
| [`docs/`](./) | Architecture, decisions, planning, design and runbooks |

The [architecture guide](architecture/solution-architecture.md) describes the intended module structure.
Inspect the source and open work to distinguish implemented features from planned modules.
