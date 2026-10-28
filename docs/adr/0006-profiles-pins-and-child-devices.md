# ADR-0006: Profile picker, child PINs, paired child devices, and children approved by both parents

- **Status:** Accepted (2026-10-17, owner approval). Partly superseded, once accepted, by
  [ADR-0007](0007-shared-devices-and-parent-pins.md) (#153): explicit shared devices, parent PINs, two-stage lockout
  and immediate child PIN reset replace the household, parent-tile, lockout and reset rules below.
- **Date:** 2026-10-17
- **Supersedes:** the child-login part of §5, and decisions 7 (for children only) and 8 in
  [solution-architecture.md](../architecture/solution-architecture.md) §9. Backlog item A-05 is replaced.

## Context
The approved design gave each child a separate account (username plus password), activated with a one-time code on
the child's device. On October 17, 2026 the owner asked for something closer to how families actually share devices:
- **A Netflix-style "Who's using Parenthesis?" picker** after sign-in, with a tile for the parent and one for each
  child.
- **Children unlock with a short numeric PIN.** Parents always use their full password.
- **Children can use their own tablet** without a parent signing in on it.
- **Lockout:** three wrong PINs lock the child's profile, notify both parents, and either parent can unlock it with
  one tap.
- **A child exists only once both parents approve it,** even before the co-parent has joined. No "auto-confirm" for
  children.
- **Never merge families.** If both parents already set up a family, block and explain.
- **The diary stays private** from parents.

A 4–6 digit PIN is weak on its own: 10,000 to 1,000,000 combinations. The design must make sure a PIN can never be
tried from just anywhere.

## Decision

### Devices are the trust anchor
- **Household device.** When a parent signs in, the browser or phone is registered as a household device for that
  family. It gets a long-lived, HttpOnly, `Secure`, `SameSite=Strict` device cookie, whose token is stored only as a
  hash. That device can show the family's profile picker (names and avatars only).
- **Paired child device.** On their own phone, a parent creates a **pairing code**: 8 characters or a QR code,
  single use, valid for 10 minutes, stored hashed. The child's tablet enters it and becomes a device that is paired
  to **that one child only**. No parent ever signs in on it.
- **A PIN works only on a registered device for that family.** A PIN from anywhere else is rejected, the same way
  as a wrong PIN, so a stranger on the internet can't try PINs at all.
- Parents see every device (name, type, last used) and can **revoke any device instantly**. Revoking is protective,
  needs no approval, and is audited.

### Switching profiles
- **Parent tile:** always asks for that parent's full password, even if the parent used the device a minute ago.
  Choosing a child profile ends the parent's session. A child can't "tap back" into a parent profile.
- **Child tile:** asks for the child's PIN (4–6 digits, hashed with the Identity password hasher). It starts a
  **child session**: a cookie whose principal is the child profile (role `Child`). The child-only shell and
  authorization apply; the server never sends parent data to a child session.
- **Parents can preview a child's view.** "View as Kai" opens a read-only preview of the child's space, from the
  parent's session. **It excludes the private diary** (decision 9 stands).

### PIN lockout
- **Three** wrong PINs in a row lock the child's profile on every device. There is also rate limiting per device and
  per IP.
- Both parents are notified (email now, in-app once notifications exist), with the device name.
- **Either parent can unlock with one tap.** That's protective, needs no approval, and is audited. Parents can also
  reset a PIN; a reset needs the other parent's approval, like enabling access (decision 8).

### Children need both parents' approval
- Adding a child creates a `ChangeRequest` of type **`ChildCreate`** (ADR-0003). The profile stays **pending**,
  invisible to the child shell and unusable, until both parents approve it.
- **The single-parent auto-confirm** (decision 7) **does not apply to children.** If the co-parent hasn't joined yet,
  the request waits, and they approve it when they join. Decision 7 still applies to calendar actions.
- **Setup asks for the household size** (how many children). It then creates one `ChildCreate` request per child.
- **Enabling a child's sign-in** (setting the first PIN) is part of the creation request, or a later
  `ChildAccessGrant` (decision 8). **Disabling it is immediate.**

### Invitations
- **Invite the co-parent by email,** with a hashed, expiring, revocable token (FM-03).
- **The email depends on whether the invitee already has an account:** "Join Dad's family on Parenthesis" instead of
  "Sign up". **The inviter is never told** whether an account exists. The UI always says "Invitation sent", so the
  invite box can't be used to look people up.
- **If the invitee already belongs to another family as a parent:** families are **never merged**.
  - Accepting shows an explanation.
  - If it's the **same children,** they're asked to remove the duplicate family first, so a family's children and
    history are never combined or overwritten.
  - If it's a genuinely **different family** (a blended family, FM-06), they confirm, and the account belongs to
    both families separately.

## Consequences
- **(+)** It matches how families share phones and tablets. Children never need an email address or a typed
  password.
- **(+)** Weak PINs are safe in practice, because they only work on a registered device, lock after three tries, and
  both parents are told.
- **(+)** "Both parents agree" now also covers who counts as a child of the family.
- **(−)** More to model and test: devices, pairing codes, child sessions, lockout, previews.
- **(−)** A lost but still-registered device keeps its picker until a parent revokes it. The device list and
  instant revoke mitigate this.
- **(−)** A household device signed in by one parent shows the other parent's tile only if both are family members.
  Each parent still needs their own password.

## Data model additions (`identity` and `families` schemas)
| Table | Purpose |
|---|---|
| `device` | `id, family_id, kind (Household \| ChildPaired), child_profile_id NULL, name, token_hash, created_by, created_at, last_seen_at, revoked_at` |
| `device_pairing_code` | `id, family_id, child_profile_id, code_hash, expires_at, used_at, created_by` |
| `child_credential` | `child_profile_id PK, pin_hash, failed_attempts, locked_at NULL, updated_at` |
| `child_profile.status` | `PendingApproval \| Active \| Archived`. Only `Active` profiles appear in the picker. |
| `change_request.type` | Adds `ChildCreate`, alongside `ChildAccessGrant` |
