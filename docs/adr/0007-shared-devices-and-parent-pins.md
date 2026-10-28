# ADR-0007: Explicit shared family devices, parent PINs and two-stage PIN lockout

- **Status:** Proposed (2026-10-28). It records the owner's #153 decisions of October 28, 2026 as implemented on
  `claude/parenthesis-shared-device-flow-8hp9sf`. The owner accepts or changes it in that PR's review.
- **Date:** 2026-10-28
- **Supersedes (once accepted):** parts of [ADR-0006](0006-profiles-pins-and-child-devices.md): automatic household
  registration, the password-only parent tile, the immediate three-strike child lock, one-tap unlock, and co-parent
  approval for a child PIN reset. ADR-0006 stays accepted for everything else: child sessions, paired child tablets,
  PINs only on registered devices, both parents approving a new child, invitations and the private diary.
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
  family device?"**. *No* continues privately. *Yes* registers the browser for the parent's family, creates their
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

### Notifications reuse the existing email pipeline
`EmailContent` → `EmailTemplate.Render` (HTML + plain text, approved icon inline by CID) → `IEmailSender`, with links
from the configured `App:PublicBaseUrl`. Four messages, one recipient each, no PINs or tokens, no names in subjects:

| Event | Recipient | Subject |
|---|---|---|
| Parent PIN paused (first three failures) | that parent | Your parent PIN is paused |
| Parent PIN locked | that parent | Your parent PIN is locked |
| Child PIN locked (not the first pause) | each currently active parent | A child's PIN is locked |
| Child PIN reset | the other active parent(s) | A child's PIN was reset |

Emails go out only at those transitions, so one lock cycle sends at most two parent emails. The API reports
`notified: true` only when the mail server accepted the message; the app never claims an email was sent otherwise.

## Not decided here (blocked on the owner)
- **Short-lived, single-use parent PIN reset link.** The owner requires one, but its lifetime and resend policy aren't
  approved yet (the design audit forbids inventing them). Until then, the pause and lock emails link to Settings and a
  parent resets their PIN after password sign-in plus password confirmation.
- Already paired child tablets: direct-to-PIN versus a single tile. The existing single-child picker is kept.
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
| `parent_credentials` | New: `membership_id` (unique, FK), `family_id`, `pin_hash`, `failed_attempts`, `paused_until`, `locked_at`, `updated_at`, `check_count`, `xmin`. |
