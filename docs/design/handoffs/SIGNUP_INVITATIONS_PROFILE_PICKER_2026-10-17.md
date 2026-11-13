# Sign-up, invitations & profile picker — design handoff (2026-10-17)

**October 28 reconciliation:** this is historical delivery evidence. For shared-device
entry, parent PIN, two-stage lock/recovery, explicit device trust and current visual
approvals, use [issue #153's handoff](../shared-device-issue-153.md) and
[state audit](../shared-device-state-audit-153.md). The newer owner decisions
supersede conflicting password-only, immediate-lock and PIN-reset approval rules;
they do not mean those changes are implemented or the complete handoff is accepted.

- **Status:** Approved by owner (verbal approval, 2026-10-17) for the design requirements and direction; **visual asset delivery pending**. Do not claim pixel-perfect implementation readiness until mockups are committed.
- **Screens:** Mobile-first and desktop, light and dark: (1) household size and add children, (2) co-parent invite and sent confirmation, (3) two invitation email variants, (4) profile picker and parent password / child PIN, (5) wrong PIN / locked / parent unlock notification, (6) pair Kai's tablet by short code or QR, tablet code entry, device list and remove, (7) co-parent approval for Kai and Aurora.
- **Assets:** Planned `docs/design/assets/onboarding/onboarding-<screen>-<mobile|desktop>-<light|dark>.png`. **No screen export is included in this commit.** The previously supplied dashboard screenshot is not an onboarding mockup.
- **States shown / required:** default, empty, loading, error, pending, invitation sent, awaiting co-parent approval, PIN incorrect with tries remaining, locked after 3 failed tries, unlock notification, pairing code expired after 10 minutes, device removed, children approved / not approved.
- **Notes for Claude:**
  - Household setup asks “How many children are in your family?”; each child has first name and optional avatar; show “Waiting for your co-parent to approve” until approved.
  - Invite co-parent by email; show “Invitation sent” without revealing whether an account already exists.
  - Email versions: “Sign up to join Dad's family” (new account) and “Join Dad's family” (existing account). Do not expose account existence in the invitation-sending UI.
  - “Who's using Parenthesis?” picker tiles: Dad, Mom, Kai, Aurora. Parent → full password screen. Child → numeric PIN pad, 4–6 digits.
  - After incorrect child PIN, display tries remaining; after three failures lock with “Ask Mom or Dad to unlock.” Notify a parent with an Unlock action. Actual authentication, authorization and rate limiting are backend responsibilities.
  - Pair Kai's tablet: parent's phone displays short code and QR code valid for 10 minutes; tablet displays “Enter the code”; parent's device list includes “Remove device.”
  - Co-parent review screen: “Approve Kai and Aurora?” Clearly distinguish pending from approved.
  - Only fictional Mom, Dad, Kai, Aurora; synthetic avatars and media. Child screens never reveal parent disagreements or approvals.
  - Use ivory `#F7F5ED`, white surfaces, sage `#E4EBDD`, forest `#203A31`, teal `#176B67`, restrained coral `#DE8F7E`. Light and dark themes; WCAG AA and minimum 44px tap targets.
  - Logo LOCKED: Variation 1 icon + Option B wordmark. Use only visually verified original exports; never redraw, restyle or recolor. Follow `docs/design/BRANDING.md`, `docs/design-system.md`, and `docs/design/APPROVED_DASHBOARD_2026-10-16.md`.
- **Open questions:** PIN length rule (4, 5 or 6 digits), parent unlock permissions and security, invitation variant handling, exact responsive layouts and visuals pending export, backend feature scope.

## Implementation boundary
The owner has verbally approved the requested design direction and authorized this design-spec PR. **This text-only handoff is not a substitute for screen mockups.** Claude may review technical feasibility and prepare an implementation branch but must not invent unprovided visuals or represent unbuilt states as functional. Obtain approved image exports before fidelity implementation. Do not merge or deploy without owner approval.

Related design request: #39.

## Mockup and how it was built (October 20, 2026)
The board `docs/design/parenthesis_request1_mockup.PNG` (uploaded October 18) shows all ten flows. The screens shipped
in v0.2.0 (#59, #70) with the owner's decisions of October 18, 2026, which **override the board** where they differ:

| Board | Built (owner decision) |
|---|---|
| Invitations expire in 14 days | 7 days, and the email says 7 days |
| Three invalid-link screens (expired, used, revoked) | One calm generic screen |
| Child tiles with photos and ages | Initials, no age. Since #388 (October 30, 2026) each tile shows that person's own photo when they've chosen one, initials otherwise; still no age ([profile photos](PROFILE_PHOTOS_388.md)) |
| Child PIN on a numeric keypad with dots | One number box and "Go"; 4 to 6 digits chosen by a parent; tries left shown |
| Locked PIN: "Request unlock" button | "We've let your parents know"; both parents are emailed; Unlock is in Settings |
| Pair a tablet: QR code and 6-digit code | 8-character code typed in a text box (QR deferred) |
| Parent tile: password only | Email and password (the picker only knows the name) |

The board's header logo is a drawn concept, not the approved export: use it as layout reference only and never copy
it (`docs/design/BRANDING.md`).

Compared against the built screens' code (not screenshots), the board also shows these. The owner decided them on
October 20, 2026:

| Board shows | Decision |
|---|---|
| "Decline all" on the co-parent's child approval | Left out: one decision per child; a bulk decline is easy to tap by mistake. |
| Illustrations on empty and confirmation screens | Text-only until the owner approves an illustration set; never generated stand-ins. |
| Phone notification for a locked PIN | Email to both parents for now; push and in-app alerts come with notifications (N-01/N-02) in v0.4.0. |
| "Invitation settings" row on the invite screen | Dropped: nothing is configurable (7-day invitations); resend and cancel are in Settings. |
| Show/hide password eye | Not built yet; tracked in `TODO.md` under "Dashboard and design". |

The child's own home screen isn't part of this board; it belongs to
v0.5.0 (Child experience).
