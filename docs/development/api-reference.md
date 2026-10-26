# Local API reference

Start the API with the [local setup guide](getting-started.md). This table preserves the foundational endpoint
reference; it is not an exhaustive list of calendar, approvals or family APIs. The running application's
OpenAPI document describes the endpoints available in that checkout.

The [Development launch profile](../../src/backend/CoParent.Api/Properties/launchSettings.json) exposes HTTP on
port 5180 and HTTPS on 7180. The examples below use HTTP. Auth paths grouped in a row share the `/api/auth` prefix.

| Endpoint | Purpose |
|---|---|
| `GET http://localhost:5180/health/live` | Liveness: process is up (no dependency checks) |
| `GET http://localhost:5180/health/ready` | Readiness: PostgreSQL reachable; `503` otherwise |
| `http://localhost:5180/swagger` | Swagger UI (Development only) |
| `GET http://localhost:5180/openapi/v1.json` | OpenAPI document (Development only) |
| `GET /api/antiforgery` | Issues the `XSRF-TOKEN` cookie; send it back as `X-XSRF-TOKEN` on POST/PUT/PATCH/DELETE |
| `POST /api/auth/register`, `/login`, `/logout` | Cookie sign-in (rate limited; [ADR-0004](../adr/0004-cookie-authentication.md)). Sign-in needs a confirmed email |
| `POST /api/auth/confirm-email`, `/resend-confirmation`, `/forgot-password`, `/reset-password` | Email confirmation and password reset. Emails appear in Mailpit at http://localhost:8025 |
| `GET /api/me` | The signed-in user |
| `POST /api/families`, `GET /api/me/families` | Create a family (you become a parent); list your families |
| `GET /api/families/{familyId}` | Family details and members. Non-members get `404`, as if it didn't exist |

Errors are returned as RFC 9457 `application/problem+json` with a `traceId`. Every response also carries a `trace-id` header that matches the `TraceId` in the server logs.

In Docker and Azure the API serves the built Angular app itself (same origin, so the session cookie never crosses origins). Locally, register at http://localhost:4200/register and open the confirmation email in Mailpit.

See [ADR-0002](../adr/0002-tenant-isolation.md) for tenant isolation and the
[solution architecture](../architecture/solution-architecture.md) for API and module design.
