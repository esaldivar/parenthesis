# ADR-0007: Explicit shared family devices, parent PINs and two-stage PIN lockout

- **Status:** Proposed (2026-10-28). It records the owner's #153 decisions of October 28, 2026 as implemented on
  `feat/153-shared-device-flow` (PR #336). The owner accepts or changes it in that PR's review.
- **Date:** 2026-10-28
- **Supersedes (once accepted):** parts of [ADR-0006](0006-profiles-pins-and-child-devices.md): automatic household
  registration, the password-only parent tile, the immediate three-strike child lock, one-tap unlock, and co-parent
  approval for a child PIN reset. ADR-0006 stays accepted for everything else: child sessions, paired child tablets,
  PINs only on registered devices, both parents approving a new child, invitations and the private diary.
- **Owner decisions added in the PR conversation (October 28, 2026):** reset link valid 15 minutes with at most one
  parent-requested link per 15 minutes; a child's paired tablet goes straight to the PIN; a parent's "No" to the
  shared-device question is remembered in that browser; devices registered before this change expire 30 days after
  their registration.
- **Source:** [issue #153](https://github.com/esaldivar/parenthesis/issues/153) body ("Owner-approved shared-device and
  PIN decisions — October 28, 2026") and its owner comments; [design audit](../design/shared-device-state-audit-153.md).

## Context
ADR-0006 registered a parent's browser as a household device and always asked parents for their full password. The
owner wants a Netflix-style picker only on devices a parent explicitly chooses to share, a six-digit parent PIN for
returning to their own profile there, and a gentler, two-stage PIN lockout. Device trust affects security, so the
rules below are server-side; hiding things in the app is never the boundary.

## Decision

### Shared family devices are explicit and time-limited
- Signing in never registers a device. After a password sign-in, a parent with a family is asked **"Is this a shared
  family device?"**. *No* continues privately, and is remembered in that browser for that parent only (local storage,
  not a security setting), so a personal device doesn't ask again; Settings still offers setup. *Yes* registers the browser for the parent's family, creates their
  six-digit parent PIN if they have none, and binds their current session to the device: no second password prompt.
- A shared device's picker lasts a **fixed 30 days from setup**. Activity never extends it. After that, a parent signs
  in with email and password and sets the device up again.
- The picker shows **only the parent who set the device up** and the family's **approved** children, by name. The
  other parent never appears and can't use a PIN there; they sign in with their own email and password (and may set
  the device up for themselves, which replaces the earlier registration).
- **Revoking** a device (either parent, immediate, audited) ends every parent and child session on it at once. So
  does expiry, and so does the setting-up parent losing their membership. Signing in again doesn't restore sharing.
- **Full sign-out** by the setting-up parent removes the device, so its picker is gone until a parent sets it up
  again. **Switch profile** (`POST /api/device/switch`) ends the current session and keeps the picker.

### Parent sessions are bound to the shared device
- A parent session started on the shared device (by PIN, by setup, or by password sign-in on it) carries a
  `parenthesis:shared_device` claim. Every request re-checks that the device is usable and still owned by an active
  parent membership of that user; otherwise the session ends. The claim survives Identity's security-stamp refresh.
- Switching to a child replaces the parent's session cookie on the server, so browser Back can't restore parent
  access. Returning to the parent needs their PIN or password.
- A child's own paired tablet opens straight to that child's PIN; it never shows a picker of other profiles.

### PINs: parents and children share one retry policy
- **Child PIN:** 4–6 digits, set by the parent who first enables sign-in. **Either authorized parent resets it at once**
  (no co-parent approval). A reset clears any pause or lock and emails the *other* active parent(s) who reset which
  child's PIN, never the PIN. Requests for PIN changes made under ADR-0006 still resolve; no new ones are created.
- **Parent PIN:** exactly six digits, per family membership, not trivially guessable. A parent changes it in Settings
  after confirming their account password (rate-limited; wrong passwords count toward the account lockout).
- **Retry policy (both):** three wrong PINs pause that PIN for ten minutes; no PIN is checked during the pause, the
  right one included. Three more wrong PINs after the pause lock it until it is reset. A right PIN clears the failed
  count and the earlier pause; only a reset clears a lock. Counts live on the credential, so they apply across devices
  and sessions. Malformed input is refused without counting. Each check writes the row under an `xmin` concurrency
  token, so racing guesses can't share a count; a lost race gets a neutral "try again" that reveals nothing.
- Other profiles stay available while one PIN is paused or locked. A parent's account and password sign-in are never
  locked by the PIN policy.

### Parent PIN reset link
- Each parent pause or lock email carries a fresh **single-use reset link valid for 15 minutes**; the parent can ask for
  one more from their PIN screen at most **once every 15 minutes** (any link issued in that window counts). A new
  link replaces older unused ones. Tokens are 256-bit random values stored only as SHA-256 hashes.
- The link alone grants nothing: the parent it was sent to must be signed in with email and password and confirm the
  password before a new PIN is saved. Only a successful save uses the link. Expired, used and unknown links get the
  same answer; another parent is only told to use the account the link was sent to. The page moves the token out of
  the address bar at once (kept for that tab only).
- A parent can also always reset their PIN in Settings after password sign-in and password confirmation.

### Notifications reuse the existing email pipeline
`EmailContent` → `EmailTemplate.Render` (HTML + plain text, approved icon inline by CID) → `IEmailSender`, with links
from the configured `App:PublicBaseUrl`. Four messages, one recipient each, no PINs or tokens, no names in subjects:

| Event | Recipient | Subject |
|---|---|---|
| Parent PIN paused (first three failures) | that parent | Your parent PIN is paused |
| Parent PIN locked | that parent | Your parent PIN is locked |
| Child PIN locked (not the first pause) | each currently active parent | A child's PIN is locked |
| Child PIN reset | the other active parent(s) | A child's PIN was reset |
| Reset link the parent asked for | that parent | Reset your parent PIN |

Emails go out only at those transitions, so one lock cycle sends at most two parent emails. The API reports
`notified: true` only when the mail server accepted the message; the app never claims an email was sent otherwise.

## Still deferred
- Child personal-device sign-in, photo upload, QR pairing and in-app/push alerts stay deferred.

## Consequences
- **(+)** No device is trusted silently; public or borrowed browsers stay personal.
- **(+)** Revocation, expiry and lost access end parent sessions too, not only child sessions.
- **(+)** Short PINs stay safe: device-bound, server-counted, race-proof, with a lock that needs a reset.
- **(−)** Every request from a device-bound parent session does a small extra lookup.
- **(−)** Shared devices need setting up again every 30 days.
- **(−)** Shared devices registered before this change get the same 30-day rule from their registration date, and
  their parent tile falls back to password sign-in until the parent chooses a PIN.

## Data model changes (`families` schema)
| Table | Change |
|---|---|
| `devices` | `expires_at` (shared devices: setup + 30 days; null for paired tablets). Existing household devices backfilled. |
| `child_credentials` | `paused_until`, `check_count`, `xmin` concurrency token. `locked_at` now means "reset required". |
| `parent_pin_reset_tokens` | New: `membership_id` (FK), `family_id`, `token_hash` (unique), `created_at`, `expires_at`, `used_at`. |
| `parent_credentials` | New: `membership_id` (unique, FK), `family_id`, `pin_hash`, `failed_attempts`, `paused_until`, `locked_at`, `updated_at`, `check_count`, `xmin`. |
