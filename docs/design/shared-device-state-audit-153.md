# Shared-device state audit and review specification — #153

October 28, 2026. **Draft for owner review; not implementation authorization.**

> **Implementation update (October 28, 2026, later):** the owner then labelled #153 for Claude implementation. The
> server rules, four runtime emails and the screens listed in the
> [handoff's implementation status](shared-device-issue-153.md#implementation-status--october-28-2026-supersedes-no-app-implementation-below)
> are built on `feat/153-shared-device-flow`, with [ADR-0007](../adr/0007-shared-devices-and-parent-pins.md)
> proposed. Routes as built: `/shared-device/setup`, `/profiles/parent/:id` (parent PIN),
> `/profiles/parent/:id/password`; APIs `POST /api/families/{id}/devices/household` (setup),
> `GET|PUT /api/families/{id}/parent-pin`, `POST /api/device/parent-session`, `POST /api/device/switch`, and the
> reset link `/parent-pin/reset` (`POST /api/device/parent-pin-reset`, `POST /api/families/{id}/parent-pin/reset[/check]`)
> after the owner set a 15-minute single-use lifetime and one parent-requested link per 15 minutes. The
> source-audit gaps below are historical where this update says they are now implemented.
Source: issue #153 and all 16 comments, PR #332, approved boards, ADR-0006,
the October 17 handoff and source at design head `b1c8a72`.
Compared the relevant auth/profile/email files with release/0.3.0 `1f7986e`:
no differences in the inspected directories. This is source inspection, not live-site verification.

## Reconciled decisions

The October 28 issue body supersedes the early password-entry comments and older
ADR/handoff where they conflict: explicit device opt-in, parent six-digit PIN on
subsequent entry, only the associated parent plus eligible children, three failures
→ ten-minute pause → three further failures → reset-required lock, successful entry
clears both stages, either authorized parent may reset a child PIN without waiting
for the other parent's approval. No automatic device registration. Full sign-out
removes picker eligibility; Switch profile ends the active session but retains
eligible shared-device access. Shared-device eligibility expires 30 days after setup,
never extended by activity. Revocation immediately ends affected parent AND child
sessions. Signing in alone does not restore revoked/expired sharing.

ADR-0006 remains an accepted historical ADR; its automatic trust, password-only
parent tile, other-parent tile, immediate child lock/one-tap unlock, and co-parent
approval for PIN reset must be superseded through a reviewed ADR before coding.
Do not silently rewrite it as though the new behavior is implemented.
The October 17 handoff's “no mockups” wording is already qualified by its October 20
addendum and committed `parenthesis_request1_mockup.PNG`. Initials remain a valid
fallback; named circles with an existing icon/image are now accepted. Photo uploads,
ages, QR pairing and a new illustration set are not implied.

## Actual coverage and explicit reuse proposals

“Approved” below means visual direction only. All branding caveats still apply.
Reuse proposals and new state specifications require owner review; they do not
inherit approval from a related screen. Mobile means 320px upward; desktop means
a readable centered card with a maximum content width, not stretched phone content.

| State | Approved reference | Remaining design/reuse for review |
|---|---|---|
| Shared choice | `shared-device-picker-issue-153.png`, mobile light | P3 copy adds visible trust/30-day explanation; reuse stacked actions at desktop and dark tokens |
| Initial parent PIN | No complete setup form in the approved setup board | Reuse R4 six-digit + confirmation form after opt-in, before registration succeeds; existing PIN skips creation; setup failure must not claim shared access |
| Picker | Mobile light; desktop light; `shared-device-dark-desktop-picker-issue-153.png` | Explicit dark-mobile reuse: wrap named circles, preserve order and names, initials fallback; no other-parent tile |
| Parent PIN | Mobile light; desktop light/dark | Preserve approved keypad direction; add labelled underlying numeric masked input, explicit submit, selected parent's actual name; no six-digit child requirement |
| Parent pause | Mobile light; `parent-pin-pause-dark-desktop-issue-153.png` | Light desktop / dark mobile reuse of same card; absolute retry time plus visual countdown; notification pending/failure variants |
| Parent lock | No separately approved screen | P4 lock variant reuses parent pause card without timer; Reset PIN + Back to profiles; keep password recovery available |
| Child PIN | Mobile light | Desktop uses parent-entry layout with 4–6 digit input and Go; dark uses semantic tokens. Variable length requires explicit submit, never sixth-digit auto-submit |
| Child pause | Mobile light | Reuse parent pause layout on desktop/dark with friendly child copy, parent-help and back actions; no email claim or initial email |
| Child reset-required lock | Mobile light; desktop light; dark desktop | Explicit dark-mobile reuse of existing lock card; either authorized parent resets through own account; other profiles available |
| Parent recovery core | Approved mobile light `parent-pin-recovery-issue-153.png` | Dark desktop recovery/device-expiry board approved October 28 after direct image review; includes expiry instead of new-PIN form. R1–R4 supplement completes flow; success E4 |
| Reset-link edges | None approved | E1 generic expired/used/invalid link, E2 unavailable inbox, E3 mismatch, E4 saved; both themes use same content/action order |
| Expired / revoked device | Approved mobile light expiry in PIN/device board | D1 explicitly reuses layout for both causes without old profiles. Dark expiry panel approved October 28; explicit reuse specification still needs review |
| Session expiry | None approved | D2; route by freshly confirmed device eligibility, not a stale picker |
| Loading / fetch failure | None approved | D3; no stale names during load/error; Retry and full sign-out; loading status announced once |
| Empty / pending | Historical mockup has authenticated pending-child management | P1 parent-only picker. Pending children absent; approval names/disputes only in authenticated management, never child-facing picker |
| Missing child PIN | Existing source descriptive non-link tile | P2 reuses that behavior, with clear parent-help copy; no sign-in attempt |
| Authorization removed | None approved | Clear affected session immediately, generic “This profile is no longer available”; Back to profiles only after fresh eligibility check, otherwise parent sign-in; no removed person's name |
| Revoke confirmation / result | Historical device management reference | D4 confirmation; successful removal: “Device removed” + refreshed list; failure keeps device row, Retry, never success toast; current device returns to D1 |
| Already paired child | Existing source and historical mockup | Preserve single-child entry + PIN, no parent/sibling data. Do not apply household picker/30-day policy implicitly. Broader personal-device redesign deferred; direct-to-PIN versus tile still needs owner decision |

New static state review source: [states.html](reviews/issue-153/states.html).
R/P/E/D identifiers refer to that file. All 16 states have light/dark variants and
a single-state 320px layout. These are precise functional supplements to the
approved art direction, not a proposed replacement illustration style or app code.

## Proposed route and transition contract

Existing routes: `/sign-in`, `/profiles`, `/profiles/parent/:id`,
`/profiles/child/:id`, `/forgot-password`, `/reset-password`, `/pair`, `/settings`,
parent home `/`, child home `/kid`.
Proposed routes below are design contracts only and do not exist yet:

| Trigger | Transition / invariant |
|---|---|
| Fresh parent password sign-in | `/shared-device/setup` → No → parent return URL or `/`; Yes → initial PIN if absent → explicit registration → same authenticated parent home |
| Setup save fails / offline | Stay in setup; “We couldn’t set up sharing. Try again.” Retry or Continue privately. Do not create partial trust or repeat initial password unnecessarily |
| Returning shared device | Current signed-in profile stays active. With no active session and fresh eligibility → `/profiles` |
| Switch profile | End current session server-side → refresh eligibility/antiforgery → `/profiles`; if ending session fails, clear protected view, offer retry, never show child content over live parent access |
| Full sign-out | End session AND remove current picker eligibility → `/sign-in`; independently signed-in other parent starts their own setup/association |
| Parent tile / child tile | Existing profile route → corresponding PIN → `/` or `/kid`; invalid input does not count as a server PIN attempt |
| Parent Forgot PIN / lock reset | `/profiles/parent/:id/reset` (R1) → request pending → R2 only on accepted request; delivery failure uses neutral retry message, no false confirmation |
| Valid parent reset email | `/parent-pin/reset` → validate token without consuming on GET → R3 own credentials → R4 → E4; consume once only on successful save |
| Expired/used/malformed token | E1; same visible result; no account identifiers. Request new link uses eligible recovery path and rate limits |
| Wrong authenticated account | “Use the parent account this reset link was sent to.” Switch account / Cancel; no recipient address; token cannot reset another parent |
| Lost password | `/forgot-password` → existing `/reset-password` → `/sign-in` → restart parent PIN recovery with valid credentials and a fresh link if needed |
| Password recovery unavailable | E2; no insecure bypass, no invented support channel; inbox recovery external to Parenthesis. Safe exit and other eligible profiles remain available |
| Session expires mid-reset | Clear PIN fields, reauthenticate with own credentials; revalidate link and authorization before save; expired/used token → E1 |
| Save timeout / uncertain result | “We couldn’t confirm your PIN was saved.” Do not claim success or automatically resubmit a token. Recheck server outcome; confirmed saved → E4, unusable link → E1 |
| Child reset | Authorized parent signs in via `/sign-in`, authenticated `/settings` child controls; 4–6 digit PIN + confirmation; immediate reset on success; notify other authorized parent, no PIN |
| Fixed expiry / revocation | Clear all picker data and protected content → D1 → password sign-in → explicit setup; never silently re-register |

Pending controls say “Sending…”, “Checking…” or “Saving…” and prevent duplicate
submissions. Keep Cancel/back available when safe. API/network errors never consume
PIN attempts unless the server actually evaluated an incorrect PIN. Rate-limited
actions show server retry time and safe exits; a local countdown cannot authorize retry.
Do not invent a PIN-link lifetime: it must be short and server-defined, with duration
and resend policy approved in the security follow-up before implementation.

## Source audit and implementation gaps

- `profile-picker-page.ts` and `guards.ts`: refreshable named tiles, unavailable-PIN
  descriptive tile and signed-out picker guard exist. Fetch failures can retain old
  `AuthStore.device` data; design requires clearing/hiding stale profiles. Parent entry
  still uses `parent-password-page.ts` email/password. New setup and parent PIN routes
  above are absent. Normal sign-in does not offer explicit shared setup.
- `child-pin-page.ts`: labelled masked numeric input, 4–6 digit validation, busy/error
  handling, tries-left and immediate 423 lock exist. Two-stage pause/reset policy does
  not exist here; lock copy currently claims notification without delivery evidence.
- `auth.store.ts`: `signOut()` reloads device picker; switching and full sign-out need
  different server contracts. Parent guards redirect signed-in users away from picker.
  Hiding UI cannot prove server session invalidation or safe browser-back behavior.
- `AccountRecoveryEndpoints.cs`, forgot/reset-password pages: password recovery exists;
  forgot uses neutral response, reset handles invalid/reused/expired links and strips
  query parameters from history. This is password recovery, not parent PIN recovery.
  Security-stamp rotation exists; immediate invalidation timing still needs runtime tests.
- `IdentityModule.cs`: child sessions revalidated per request; parent sessions use Identity
  validation. Immediate device revocation of both kinds and authorization loss must be
  verified explicitly, not inferred from a child validator or security-stamp comment.
- Settings registration/pairing/device management and old child lock emails exist.
  Existing paired-child entry must stay isolated while its broader redesign is deferred.

## Accessibility, privacy and security review

Use current semantic tokens and Material/CDK behavior. Approved raster concepts have
navy/dark-blue and illustrated variants; sample colors, small hints, contrast and
fixed phone frames are not acceptance evidence. Text-only state supplements use the
design-system tokens. Keep exact icon unchanged, separate decoration from content.
No age, email, family name, pending approval dispute or other parent's tile on the
picker. Display real eligible names only at runtime; examples here are synthetic.

Label the whole PIN field (dots alone are not its accessible name), support physical
keyboard, numeric mobile input, paste and leading zeroes. A custom keypad must not
block the real input; digits and delete need accessible names and at least 44px targets.
Use explicit submit for variable-length child PINs. No timer announcement every second:
announce pause once with absolute retry time, then “You can try again” on expiry.
Wrong-PIN/error messages use live alert and associated field description. Move focus
to page heading on navigation, first invalid field on validation, and back to the
trigger after Cancel. Never trap focus in a non-modal page. Preserve focus on retry.

Required verification: 320px, desktop, 200% text and 400% zoom/reflow, long names,
keyboard/focus, forced colors, reduced motion, VoiceOver or equivalent real screen
reader. Contrast: normal text ≥4.5:1, large text and meaningful control/focus boundaries
≥3:1. Theme choice must not expose a prior profile's personal preference.
Static screenshots cannot verify these behaviors or certify WCAG conformance.

Server test scenarios: parent/child back navigation and direct API denial after switch;
other-parent exclusion; missing/pending/removed children; wrong account on reset;
concurrent reset, expired/reused links, link scanner GET never consumes token;
cross-device retry count, three/pause/three/reset, successful clear, rate limits;
immediate revocation of both session types and fixed setup+30-day boundary unaffected
by activity. Tokens/PINs absent from logs, telemetry, browser history and email text;
no third-party trackers on recovery. Configured same-origin destinations, antiforgery,
hashed device secrets, and current family authorization on every protected operation.

## Branding reconciliation

`BRANDING.md`'s broad “production exports pending” statement is qualified by the
October 20 approved export in `assets/APPROVED_ASSET_MANIFEST.md`, the email Brand
README and `shared/brand/logo.ts`: exact icon SVG and approved transparent PNG exist.
Their copies in frontend public assets/email resources are authoritative unchanged
exports. The original board exists at its actual F617… JPEG path, despite the older
manifest's “not uploaded” paragraph and expected alias. Do not crop that board.

Exact horizontal/compact/stacked wordmark masters, outlined typeface and verified
light/dark lockups remain unavailable. Existing horizontal SVGs are recorded defective;
provisional concept SVG is prohibited. New review screens use the exact icon plus
an explicit wordmark-pending annotation, without drawing a substitute wordmark.
Previously approved boards remain intact approval evidence; their approximate logos
are not final brand approval. Corrected final derivatives of all boards are still a
delivery gap until exact wordmark artwork is supplied and reviewed.

## Email design versus implementation

Existing architecture: `EmailContent` → `EmailTemplate.Render` → HTML + plain text
`EmailMessage` → `EmailMime.Build` inline CID approved PNG → `IEmailSender` SMTP.
`PublicUrls.Build` uses configured `App:PublicBaseUrl`, never request Host. Reuse this
pipeline; do not create another independent runtime HTML renderer.

| Message | Recipient | Proposed subject / preheader | Content and action contract |
|---|---|---|---|
| Parent first pause | Affected registered parent only | Your parent PIN is paused / You can retry after the pause or reset your PIN | Three failed attempts, absolute retry time with zone; Reset PIN → secure recovery request; no raw token required in this notice |
| Parent reset-required lock | Affected registered parent only | Your parent PIN is locked / Reset your PIN to use your parent profile | PIN locked, account/password not locked by this policy; Reset PIN → short-lived one-use flow plus own credentials |
| Child reset-required lock | Each currently authorized parent, separately | A child’s PIN is locked / Sign in to help reset the PIN | Child name only in body, calm explanation, either parent may reset; Sign in → own account then authorized child Settings; initial child pause sends no email |
| Child PIN reset | Other currently authorized parent only | A child’s PIN was reset / A parent updated a child’s PIN | Body identifies actor and child; View account → authenticated Settings. Do not notify unauthorized/removed parents or reveal PIN |

Every plain-text alternative has the same words, action label and one absolute URL.
Keep names out of subject/preheader, no PINs in any message, no CC/BCC recipient leak,
HTML-encode names, avoid tracking pixels and external logo fetches. Auth/authorization
checks apply again at click/save; email itself never grants parent access.

`ChildSafetyEmails.cs` currently sends the old immediate-three-attempt/one-tap-unlock
copy via `/settings`; it needs replacement, not a second conflicting notification.
Existing delivery catches child-lock send errors without undoing the lock. Keep that
secure behavior but implement retry/deduplication, recipient authorization at send
time and accurate UI status. “Sent” must never mean merely that a UI button was clicked;
SMTP acceptance also does not prove inbox delivery.

Recovered `parenthesis-pin-email-drafts.zip` contains four HTML/text pairs and README,
with `{{action_url}}` placeholders and CID icon reference. This is a standalone draft
artifact, not integrated or email-client tested; it does not satisfy working templates.
The four approved visual concepts remain approved. This audit specifies content and
integration requirements without changing renderer, token issuance or dispatch code.

Implementation still needs: four runtime message factories, actual guarded routes and
configured absolute links, token lifecycle, notification orchestration, retry/dedupe,
rendered HTML/text snapshots and MIME/CID tests. Client verification: Gmail web/mobile,
Outlook Windows/web, Apple Mail/iOS; both themes, images blocked, text-only, 320px,
long names/URLs, button contrast and actual test-email links. Browser renders are not
email-client tests. No emails were sent during this design review.

## Approval ledger and remaining work

- Approved visual directions: setup/picker/child PIN/pause board; parent PIN/pause,
  child lock/expiry board; desktop picker/parent PIN/child lock; mobile-light parent
  recovery; four email concepts; dark desktop picker, parent entry, parent pause,
  child lock; dark desktop parent recovery/device-expiry board (approved after direct image review October 28). Preserve their original assets and caveats.
- Awaiting owner review: R/E/D/P supplements; all reuse
  proposals in coverage table; completed flow contract; parent initial PIN, parent
  lock, wrong-account/network/notification failure variants; exact branding placement.
- Needs implementation approval: updated ADR, discoverable setup, parent PIN and recovery,
  two-stage policy, full-sign-out versus switch, expiry/revocation/authorization,
  email integration and verification. No code follow-up is authorized by concept approval.
- Deferred: broader child personal-device design, photo upload/customization, QR pairing,
  push/in-app alerts, child-home redesign. Preserve existing paired-child isolation now.
- Before Ready For Development: owner accepts handoff; decide direct-to-PIN versus tile
  for already paired child and approve short token/resend policy; create separately
  scoped implementation issues with observable AC and tests; resolve branding export
  dependency or explicitly approve asset-pending implementation scope.

Issue #153 remains In Design and open. No acceptance boxes are checked by this audit.

## Verification performed for this documentation update

- Visually inspected existing approved boards, the recovered dark recovery board and four dark state-supplement boards. The recovered approved image was moved unchanged into `assets/parent-pin-recovery-dark-desktop-issue-153.png`.
- Verified approved icon PNG SHA-256 matches the manifest and email copy; frontend icon SVG matches its approved source byte-for-byte.
- `git diff --check` passed. No application source changed; no application tests were run for this documentation-only change.
- Supplement PNGs are annotated typeset state specifications, not browser screenshots. Browser rendering could not run: no browser binary was installed, and browser downloads returned invalid archives. Responsive, keyboard and screen-reader checks remain unverified.
