# Data inventory

The source of truth for what Parenthesis stores and shares (#416). The public
[Privacy Notice](../../src/frontend/src/app/features/privacy/privacy-page.ts) (`/privacy`) is written from this
page; change both together. Audited against `release/0.3.0` on October 31, 2026. Findings and open gaps:
[compliance-review-416.md](compliance-review-416.md).

## Cookies

All first-party, `Secure`, `SameSite=Strict`, `Path=/`.

| Cookie | Purpose | Contents | Lifetime | Set in |
|---|---|---|---|---|
| `__Host-parenthesis` (HttpOnly) | Parent or child sign-in session | Encrypted session ticket | 14 days, sliding | `IdentityModule.cs` |
| `__Host-parenthesis-af` (HttpOnly) | Antiforgery cookie token | Random token | Browser session | `AntiforgeryExtensions.cs` |
| `XSRF-TOKEN` (readable) | Antiforgery request token Angular echoes | Random token | Browser session | `AntiforgeryExtensions.cs` |
| `__Host-parenthesis-device` (HttpOnly) | Registered shared device or child's paired tablet | Random token; server keeps its hash | Shared device 30 days, child tablet ~400 days; revocable | `DeviceCookie.cs` |

## Browser storage

| Key | Storage | Purpose | Lifetime | Set in |
|---|---|---|---|---|
| `parenthesis.appearance.<userId>` | local | Light/dark/system choice | Until cleared | `appearance.service.ts` |
| `parenthesis.event-themes.<account>` | local | Event themes on/off | Until cleared | `event-themes.service.ts` |
| `parenthesis.calendar-filters.<userId>.<familyId>` | local | Calendar filters | Until reset/cleared | `calendar-filters.ts`, `calendar-page.ts` |
| `parenthesis.sharedDevice.declined:<userId>` | local | "Not a shared device" answer | Until cleared or device set up | `auth.store.ts` |
| `parenthesis.pendingInvitation` | local | Invitation token across sign-up | Cleared on use, 7 days max | `pending-invitation.ts` |
| `parenthesis.parentPinReset` | session | PIN reset token during the flow | Cleared on use or tab close | `parent-pin-reset-page.ts` |

Every item is strictly necessary or stores a choice the person made, so no consent banner is used.
`src/frontend/src/app/core/storage-inventory.spec.ts` fails when a new file or key touches browser storage or
cookies; review it for consent and add it here and to the notice before it ships.

## Third parties

| Service | Role | Data | When |
|---|---|---|---|
| Microsoft Azure (Central US) | Hosting, PostgreSQL, Key Vault, Blob storage (`event-photos`), Log Analytics | All app data | Always |
| Brevo | SMTP relay | Recipient email; subject and body (parent names, family name, a child's first name in PIN safety notices, a link) | Account, invitation, deletion and PIN safety emails |
| Google Places (New) | Address suggestions, called from the server | Text typed in an event's location field | Only when `Places` is configured (development only today) |
| Google Calendar | One-way copy of confirmed events | Chosen event kinds, into a calendar the app created (`calendar.app.created` scope) | Only after a parent connects; disconnect revokes |
| Google Maps | Map links | The event address in a link | Only when the person clicks |
| Application Insights | Telemetry | Nothing yet (not wired) | n/a |
| UptimeRobot, Discord | Uptime monitoring and alerts | Health endpoint status only | Always |

No analytics, advertising, third-party scripts or third-party fonts are loaded in the browser.

## Personal data and retention

| Data | Who | Kept |
|---|---|---|
| Name, email, password hash, parent PIN hash, profile photo | Parent | Until account deletion |
| Family name, time zone, memberships, invitations | Family | Until the family closes; invitations expire after 7 days |
| Child first name, status, PIN hash, profile photo, settings | Child (set up by a parent) | Until the family closes or a parent asks |
| Events, tasks, reminders, unavailable time, locations | Family | Until deleted or the family closes |
| Change requests and decisions | Parents | Requests expire after 14 days undecided; decisions stay with the family |
| Event photos (re-encoded, metadata dropped) | Family | 28 days after upload |
| Devices (name, kind, token hash, expiry) | Family | Until removed or expired |
| Google refresh token (encrypted with data protection) | Parent | Until disconnect or account deletion |
| Audit records (ids, action, time; no content) | Security | Indefinitely |
| IP address | Rate limiting, in memory | Minutes; not stored |
| Container logs (Log Analytics) | Operations | Workspace default, 30 days |
| PostgreSQL point-in-time backups | Operations | 7 days |

Account deletion (A-12) removes the sign-in, name and email at once; with a co-parent, the family's shared history
stays attributed to "Former parent".
