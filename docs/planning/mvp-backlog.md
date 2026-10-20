# Prioritized MVP Backlog

Priority: **P0** = MVP-blocking, **P1** = MVP-desirable, **P2** = post-MVP.
Size: S ≤ 1 day, M ≈ 2–3 days, L ≈ 1 week. Each item should fit in one reviewable PR (L items get split when started).

## Release map (owner decision, October 18, 2026)

Each milestone is one release (see [the development workflow](../development-workflow.md#milestones)). This replaces
the earlier milestone map below as the release structure; no item was dropped or changed, only grouped.

| Release | Milestone | Backlog items |
|---|---|---|
| **v0.1.0** | 1. Foundation | E0 (F-01 to F-10) |
| **v0.2.0** | 2. Accounts and profiles | E1 (A-01 to A-11); E2 (FM-01 to FM-09) |
| **v0.3.0** | 3. Calendar and approvals | A-12 account deletion (first); E3 (C-01 to C-07); E4 (AP-01 to AP-07); calendar notifications (N-03 for calendar events) |
| **v0.4.0** | 4. Communication (proposed) | Messaging (post-MVP epic, brought forward); N-01, N-02, N-03; shared family information (to be specified) |
| **v0.5.0** | 5. Child experience (proposed) | E5 (M-01 to M-10), including the kid dashboard (M-07), diary (M-08) and Restrict/deletion (M-04 to M-06) |
| **v1.0.0** | Private beta | E7 (S-01 to S-08); D-01 parent dashboard with live data; end-to-end tests; invitation-only access |
| after 1.0 | | Google Calendar sync; billing |

Notes:
- **Moved earlier than before:** authentication and tenancy (A-01 to A-04, FM-01, FM-02) were in M1 and are now
  v0.2.0; messaging was post-MVP and is now v0.4.0. The development and production environments (part of S-03, S-04)
  are needed before the first release window, so their setup comes first (see
  [the Azure runbook](../runbooks/azure-environments.md)).
- **Moved later:** memories, uploads, mutual deletion and Restrict (old M4) are now v0.5.0; the dashboard's live data
  and hardening (old M5) are v1.0.0.
- Priorities (P0/P1/P2) are unchanged. P2 items inside a release (for example M-09, M-10, C-07, S-08) are optional
  for that release.
- Work already merged keeps its IDs. `develop` already holds much of v0.2.0 and part of v0.3.0 (for example C-01, C-06 and AP-03
  to AP-06).

### Earlier milestone map (superseded as the release structure, kept for reference)

| Milestone | Theme | Roadmap phases |
|---|---|---|
| **M1** | Foundation: walking skeleton, auth, tenancy | 1 |
| **M2** | Families, invitations, child profiles | 2, part of 5 |
| **M3** | Calendar + approval engine | 3, 4 |
| **M4** | Memories, uploads, mutual deletion, restriction | 5, 6 |
| **M5** | Dashboard, notifications, hardening, Azure deploy = **MVP release** | 9 (partial) |
| M6+ | Child diary & audio, messaging, Google Calendar sync | 7, 8 |

## E0 — Engineering foundation (v0.1.0)
| ID | Item | P | Size |
|---|---|---|---|
| F-01 | Repo scaffold: .slnx, Directory.Build/Packages.props, editorconfig, analyzers, README | P0 | S |
| F-02 | docker-compose: PostgreSQL 17, Azurite, Mailpit | P0 | S |
| F-03 | API host: ProblemDetails, health checks, OpenAPI + Swagger UI, structured logging/OpenTelemetry | P0 | S |
| F-04 | SharedKernel + Infrastructure: Entity base, UUIDv7, `TimeProvider`, shared connection/UoW, migration runner | P0 | M |
| F-05 | Integration test harness: WebApplicationFactory + Testcontainers, per-test DB reset (Respawn) | P0 | M |
| F-06 | Architecture tests: module boundaries, `IFamilyScoped` must have a query filter | P0 | S |
| F-07 | GitHub Actions CI: backend build/test, frontend lint/test/build, docker build | P0 | S |
| F-08 | Angular workspace: shell layouts, routing, Material theme, API client generation, dev proxy | P0 | M |
| F-09 | Transactional outbox + dispatcher BackgroundService | P0 | M |
| F-10 | Audit log interceptor (append-only) | P0 | S |

## E1 — Identity & authentication (v0.2.0)
| ID | Item | P | Size |
|---|---|---|---|
| A-01 | Parent register / login / logout with cookie + antiforgery | P0 | M |
| A-02 | Email confirmation & password reset (Mailpit locally) | P0 | M |
| A-03 | Lockout + rate limiting on auth endpoints | P0 | S |
| A-04 | `/api/me` + Angular auth state (signals), guards, login/register pages | P0 | M |
| A-05 | ~~Child account activation via one-time code~~ → replaced by A-08–A-11 (ADR-0006) | — | — |
| A-08 | Household device registration plus "Who's using Parenthesis?" profile picker; a parent tile always needs the full password | P0 | M |
| A-09 | Child PIN (4–6 digits, hashed). Works only on registered devices. Child session principal | P0 | M |
| A-10 | PIN lockout after 3 tries; notify both parents; one-tap unlock by either parent (audited) | P0 | S |
| A-11 | Child tablet pairing (10-minute one-time code or QR); device list with instant revoke | P0 | M |
| A-06 | TOTP two-factor authentication for parents | P1 | M |
| A-07 | Platform admin role + minimal admin endpoints (aggregates only) | P1 | S |
| A-12 | Parent deletes their own account (v0.3.0, owner decision October 20, 2026; see TODO.md) | P0 | M |

## E2 — Families & membership (v0.2.0)
| ID | Item | P | Size |
|---|---|---|---|
| FM-01 | Create family (creator becomes Parent; no owner concept) | P0 | S |
| FM-02 | Tenant gate endpoint filter + `ITenantContext` + query filters + cross-tenant tests | P0 | M |
| FM-03 | Invite co-parent by email (hashed token, expiry, revoke, accept flow). Sends a "join" email when the invitee already has an account; never reveals that to the inviter. Existing families are never merged (ADR-0006) | P0 | M |
| FM-04 | Child profiles (minimal PII). Created through a `ChildCreate` request that both parents approve; setup asks for the household size (ADR-0006) | P0 | M |
| FM-05 | Invite / enable child login (ChildAccessGrant approval; immediate disable) | P0 | M |
| FM-06 | Family switcher (user in multiple families, e.g. blended families) | P1 | S |
| FM-07 | Leave family; membership status handling | P1 | S |
| FM-08 | Category approval policy settings UI | P1 | S |
| FM-09 | "View as child": read-only parent preview of a child's space, excluding the private diary (ADR-0006) | P1 | S |

## E3 — Shared calendar (v0.3.0)
| ID | Item | P | Size |
|---|---|---|---|
| C-01 | CalendarEvent aggregate + CRUD for non-approval categories | P0 | M |
| C-02 | Calendar views (month / week / agenda, mobile-first) with category colours + child filter | P0 | L |
| C-03 | Event detail & form (children, category, location, all-day, time zone) | P0 | M |
| C-04 | Personal reminders (in-app + email) | P1 | M |
| C-05 | Recurring events (RRULE) incl. alternating-weekend custody templates | P1 | L |
| C-06 | Overlap detection for parenting time | P1 | M |
| C-07 | iCal (.ics) export feed per parent | P2 | S |

## E4 — Approval engine (v0.3.0)
| ID | Item | P | Size |
|---|---|---|---|
| AP-01 | ChangeRequest aggregate, decisions, state machine + unit tests | P0 | M |
| AP-02 | `IApprovalTargetHandler` plumbing, atomic apply, Stale detection, xmin concurrency | P0 | M |
| AP-03 | Calendar handlers: CalendarCreate / Modify / Cancel | P0 | M |
| AP-04 | Approvals inbox UI (pending / mine / history) with diff view ("before → after") | P0 | L |
| AP-05 | Approve / reject with comment; withdraw own request | P0 | S |
| AP-06 | Request expiry worker | P1 | S |
| AP-07 | Single-parent-family behaviour (auto-confirm + review on join) | P0 | S |

## E5 — Memories & uploads (v0.5.0)
| ID | Item | P | Size |
|---|---|---|---|
| M-01 | Blob storage abstraction (Azurite / Azure), user-delegation SAS read URLs | P0 | M |
| M-02 | Upload pipeline: magic-byte validation, size limits, EXIF/GPS strip, thumbnails | P0 | M |
| M-03 | Memory CRUD (photo, artwork) linked to child; gallery UI with infinite scroll | P0 | L |
| M-04 | MemoryDelete approval handler → soft delete → recovery → purge worker | P0 | M |
| M-05 | Restore during recovery period | P0 | S |
| M-06 | Restrict / lift restriction (ADR-0005) | P0 | M |
| M-07 | Kid dashboard: My Artwork, My Photos, My Memories | P0 | L |
| M-08 | Written diary with private-by-default sharing + child-friendly privacy explainer | P1 | M |
| M-09 | Audio diary recording (MediaRecorder) | P2 | M |
| M-10 | Video memories | P2 | L |

## E6 — Notifications & dashboard (v0.4.0; D-01 in v1.0.0)
| ID | Item | P | Size |
|---|---|---|---|
| N-01 | Notification inbox (outbox-driven) + unread badge | P0 | M |
| N-02 | SignalR hub pushing notification + approval updates | P0 | M |
| N-03 | Email notifications with per-user preferences (no surveillance-style nudges) | P1 | M |
| D-01 | Parent dashboard: upcoming events, pending approvals, recent memories, medical, activity | P0 | M |

## E7 — Security, quality, deployment (v1.0.0; environment setup first)
| ID | Item | P | Size |
|---|---|---|---|
| S-01 | Security headers / CSP, HSTS, data-protection key ring in Blob + Key Vault | P0 | S |
| S-02 | Accessibility pass (axe in CI + manual keyboard/screen-reader check) | P0 | M |
| S-03 | Bicep IaC: Container Apps, PostgreSQL Flexible, Storage, Key Vault, App Insights, managed identity | P0 | L |
| S-04 | Deploy workflow (OIDC to Azure, migrations job, smoke test) | P0 | M |
| S-05 | Synthetic demo-data seeder | P0 | S |
| S-06 | Playwright e2e: register → invite → propose → approve; upload → delete approval | P1 | M |
| S-07 | Threat model doc (STRIDE) + SECURITY.md | P1 | S |
| S-08 | Data export for a family (portability) | P2 | M |

## Post-MVP epics
- **Messaging** (P2; now planned for v0.4.0): conversations, SignalR delivery, attachments, optional read receipts. No presence or typing indicators, by design. Messages can't be edited or deleted (accountability), with an exportable history.
- **Google Calendar** (P2): per-parent OAuth (offline access, encrypted refresh token), one-way push of Confirmed events to a dedicated "Kids" calendar, `external_event_link` for de-duplication and updates. Bidirectional sync comes later.
- **Billing / multi-family SaaS** (P2): subscriptions, plan limits, storage quotas.
