# Shared-device screen direction — issue #153

## Implementation status — October 28, 2026 (supersedes "no app implementation" below)

After PR #332 merged, the owner labelled #153 for Claude implementation and asked for the approved, fully specified
parts to be built. Branch `claude/parenthesis-shared-device-flow-8hp9sf` (from `release/0.3.0`) implements the
October 28 owner decisions; [ADR-0007](../adr/0007-shared-devices-and-parent-pins.md) records them as **Proposed**
until the owner accepts the PR. What is done, verified and still open:

- **Implemented (server):** explicit opt-in shared device after password sign-in, fixed 30 days; picker limited to
  the setting-up parent and approved children; six-digit parent PIN; shared 3 → 10-minute pause → 3 → reset-required
  policy for parent and child PINs, counted server-side across devices with a concurrency token; immediate child PIN
  reset by either parent with a PIN-free notice to the other; parent PIN change after password confirmation;
  device-bound parent sessions ended by revocation, expiry or lost membership; Switch profile versus full sign-out.
- **Implemented (emails):** the four approved notifications as runtime `EmailContent` through the existing
  `EmailTemplate` HTML + plain-text + CID-icon pipeline, one recipient each, configured absolute links, no PINs or
  tokens, no names in subjects. The API reports whether the mail server accepted each send; screens only say "we
  emailed" when it did. The approved email board stays a visual reference.
- **Implemented (screens):** setup question and PIN form, parent PIN entry/pause/lock, child pause/lock, picker
  fetch failure and expired/revoked state, parent PIN settings, child PIN reset, device sharing end date, Switch
  profile and Sign out. They use the existing design-system components and tokens and the unchanged approved icon
  (`app-logo`); the exact wordmark stays pending. They are not claimed to match unapproved supplements.
- **Verified:** backend integration tests (`SharedDeviceTests`, `ChildAccessTests`), Vitest specs, frontend lint and
  build, and a headless Chromium walkthrough at 320px light and 1280px dark
  ([screenshots](reviews/issue-153/implementation-2026-10-28/README.md)). Not verified: real screen readers, physical
  devices, email clients, live dev site.
- **Blocked on owner decisions (not invented):** the short-lived single-use parent PIN reset link (lifetime/resend
  policy unapproved; emails link to Settings meanwhile, where password sign-in plus password confirmation resets the
  PIN); direct-to-PIN versus tile for an already paired child tablet (existing single tile kept).
- **Still pending review:** the R/P/E/D state supplements, explicit reuse proposals, final branded derivatives.

## Current status — reconciled October 28, 2026

**In Design. Individual visual approvals do not complete #153 or authorize application implementation.**
The approval entries below remain valid; their broad “still needs design” sentences
are historical snapshots, superseded by this current status and the
[state audit, coverage/reuse matrix, transitions, email contracts and review ledger](shared-device-state-audit-153.md).

Approved directions include mobile-light setup/picker/PIN/pause/lock/expiry, desktop
picker/parent PIN/child lock, mobile-light parent recovery and the four notification
emails. Dark desktop **picker, parent PIN entry, parent pause and child lock are
already approved**; do not redraw or list these as wholly outstanding.

The owner approved the [dark desktop parent recovery and device-expiry board](assets/parent-pin-recovery-dark-desktop-issue-153.png)
on October 28, 2026, after the actual image was shown in this conversation
(“Okay this works add it to the docs”). It covers request/check-email/sign-in and
device-expiry panels. The new-PIN form and saved result remain outside this board’s approval. The
[static state supplement](reviews/issue-153/states.html) supplies proposed core,
edge, device and picker states in both themes. All new supplements and explicit
reuse proposals need review. Source inspection is recorded separately from live verification.

Branding correction: the exact approved icon export **is available** (see the
October 20 export in `assets/APPROVED_ASSET_MANIFEST.md` and email Brand README).
The verified exact wordmark/lockups remain unavailable; existing horizontal SVGs
are recorded defective. New supplements use the unchanged exact icon and an
asset-pending annotation. Original approved boards retain their approximate logos
as historical evidence; final branded derivatives remain outstanding. Do not redraw,
trace or crop a substitute logo from them or the original branding board.

Working notification templates remain implementation work: reuse the existing
C# `EmailContent`/`EmailTemplate`/MIME pipeline. A recovered standalone HTML/text ZIP
contains placeholders, is not integrated and has no email-client test evidence.
The audit lists exact recipients, subject/preheader proposals, content/action contracts
and remaining security, delivery and rendering tests.

Outstanding gates: review new states and reuse, complete exact wordmark artwork,
approve superseding ADR/security policy details and paired-child entry choice,
accept complete handoff, then scope implementation issues with AC/testing. Keep #153
open; do not mark Ready For Development from concept approval. No merge/deployment.

## Historical approval record

[Picker and setup reference](assets/shared-device-picker-issue-153.png) · [PIN and device reference](assets/shared-device-pin-recovery-issue-153.jpeg) · [Desktop picker and PIN reference](assets/shared-device-desktop-issue-153.png) · [Issue #153](https://github.com/esaldivar/parenthesis/issues/153)

The owner approved the visual direction in both four-screen boards: shared-device setup, picker, child PIN entry and pause; parent PIN entry and pause, child PIN lock, and expired shared-device entry. These are visual references, not proof of implementation or approval of the entire handoff. Their generated logos approximate the approved artwork: use the exact approved brand artwork per BRANDING.md; never extract or recreate the mockup logo for production. Reconcile screens with the existing design system and issue decisions. Use synthetic data for development and tests. PIN reset and recovery flows, desktop, dark mode, emails and other states remain to be designed and reviewed. Child personal-device design is deferred.

The owner approved the desktop visual direction for the picker, parent PIN entry and child PIN lock. Names shown are placeholders; display actual eligible profile names. The approved brand artwork remains to be placed in the headers. Other desktop states remain to be designed and reviewed.

The owner approved the parent recovery flow, with the corrected parent-only PIN copy. [Parent recovery visual reference](assets/parent-pin-recovery-issue-153.png). The logo is a generated approximation; use the verified approved asset for final design and implementation. Email templates and recovery edge states remain to be designed and reviewed.

The owner approved the four-email visual direction. [Email design reference](assets/pin-notification-emails-issue-153.png): parent PIN pause, parent PIN lock, child PIN lock and child PIN reset notification. The image contains sample names and an approximated logo; use the verified approved branding, real authorized recipients and appropriate dynamic names. The HTML and plain-text templates, actual links, email-client testing and security/privacy validation still need implementation.

The owner approved the [dark desktop picker visual direction](assets/shared-device-dark-desktop-picker-issue-153.png). Profile labels are placeholders. The generated logo and tagline are approximations; use the verified approved artwork and actual branding for the final design. Other dark-mode and desktop states remain to be designed and reviewed.

The owner approved the [dark desktop parent PIN screen](assets/parent-pin-dark-desktop-issue-153.png). Place the approved brand artwork in the header for the final design. It is a visual reference; keyboard accessibility, error states and runtime security must be verified.

Owner approved the [dark desktop parent PIN pause](assets/parent-pin-pause-dark-desktop-issue-153.png). It shows the ten-minute wait, reset, and email notice. Add verified branding in the final header. Only show email-sent confirmation if delivery was successfully initiated; account for delivery failure. Verify accessibility and security in implementation.

Owner approved the [dark desktop child PIN lock screen](assets/child-pin-lock-dark-desktop-issue-153.png). The child is directed to ask a parent and can return to profiles. Add verified branding in the final header. Either authorized parent may reset the PIN; the agreed notification and security rules in #153 still apply.

Owner approved the [dark desktop parent recovery and device-expiry visual direction](assets/parent-pin-recovery-dark-desktop-issue-153.png) on October 28, 2026. This is the unchanged recovered image reviewed in the conversation. It does not approve the new state supplements or complete #153. Exact branding placement, the new-PIN form/result, recovery edge cases and implementation verification remain outstanding.
