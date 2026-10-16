# ADR-0002: Tenant isolation strategy (shared schema, FamilyId discriminator)

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16

## Context
Every family is a tenant. A data leak between families is the worst failure this product can have. We expect thousands of small tenants, so a database or schema per tenant isn't economical.

## Decision
A shared schema with a mandatory `family_id` on every family-owned table, enforced in layers:
1. **Route-scoped tenancy.** Family resources live under `/api/families/{familyId}/…`. An endpoint filter loads the caller's *active* membership and fills a scoped `ITenantContext`. If there's no membership, the response is **404**.
2. **EF Core global query filters** on every `IFamilyScoped` entity. An architecture test fails the build if an `IFamilyScoped` entity has no filter.
3. **A SaveChanges interceptor** throws if a tracked entity's `FamilyId` differs from `ITenantContext.FamilyId`.
4. **A cross-tenant test matrix** in integration tests covering every family-scoped endpoint.
5. *(Later)* **PostgreSQL RLS** using `current_setting('app.family_id')`, set per transaction, as a last line of defence against raw SQL or `IgnoreQueryFilters()` bugs.

Background workers that legitimately span tenants (purge, outbox) use an explicit `SystemTenantScope`. It's audited and can't be reached from HTTP.

## Consequences
- (+) Cheap, simple, scales to many tenants.
- (−) Isolation depends on discipline. The automated checks above are what make that discipline enforceable.
