# ADR-0004: Cookie-based authentication with same-origin SPA

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16

## Context
The SPA needs authenticated access to the API and to SignalR. Tokens in `localStorage` can be stolen through XSS. The app holds children's data, so we want the most conservative default.

## Decision
- ASP.NET Core Identity issues an **HttpOnly, Secure, `SameSite=Strict`** auth cookie. Lifetime is 14 days sliding; it's re-validated on security-stamp change.
- The API host serves the Angular build, which makes it same-origin: no CORS, and cookies flow to SignalR automatically.
- **Antiforgery** tokens are required on POST/PUT/PATCH/DELETE. Angular's `HttpClient` XSRF support reads the `XSRF-TOKEN` cookie.
- Development: the Angular dev server proxies `/api` and `/hubs` to the API, so it stays same-origin locally too.

## Alternatives considered
- **JWT bearer + refresh tokens.** Needed for third-party or native clients later. It can be added as a second scheme without changing the SPA.
- **External IdP (Entra External ID / Auth0).** A good commercial option later. For the portfolio, owning Identity shows the skill and keeps local setup free.

## Consequences
- (+) Strong XSS posture and simple SignalR auth.
- (−) A future native mobile app will need the bearer scheme.
