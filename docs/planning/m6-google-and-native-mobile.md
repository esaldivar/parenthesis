# M6 — Google Integrations & Native Mobile

Two epics in one milestone. Epic A finishes the Google integrations and their verification; Epic B ships Parenthesis
as iOS and Android apps. Facts below come from the code and runbooks in this repository as of November 13, 2026.
Anything about Google's or Apple's current rules is marked **verify** where it must be checked on their consoles or
policy pages before acting, because those rules change.

## Epic A — Google integrations

### Current state

| Integration | What exists | Scope | Runbook |
|---|---|---|---|
| Google Calendar | One-way export of confirmed family events into a secondary calendar the app creates; connect and disconnect under Settings; off until client ID and secret are set | `calendar.app.created` only | `docs/runbooks/google-calendar-sync.md` (#386, closed) |
| Google Photos | Parent-chosen event photos exported into albums the app creates; nothing read back; disconnect revokes | `photoslibrary.appendonly` only | `docs/runbooks/google-photos-export.md` (#404) |
| Google Maps | Address suggestions through the server (Places API (New), API key server-side, daily cap, rate limit) (#354); event locations open in external Google Maps (#113) | API key, no OAuth | `docs/runbooks/google-places-suggestions.md` |
| Sign in with Google | Not built. Sign-in is email and password with same-origin cookies (ADR-0004) | — | — |

Calendar sync is **one way by owner decision (October 30, 2026)**. Two-way sync is not planned and is not part of M6.
The Photos design already fits Google's 2025 Photos API limits: no library-wide read access, only app-created albums.

### OAuth verification (per integration)

| | Calendar | Photos | Sign in with Google |
|---|---|---|---|
| Scope tier | Console shows **non-sensitive** for `calendar.app.created` (Photos tracker, November 5, 2026) | **Sensitive** (console, November 5, 2026); not restricted, so no CASA security assessment | `openid`, `email`, `profile`: non-sensitive (**verify**) |
| Verification needed | Brand verification for the consent screen; data-access review only if the scope is sensitive | Data-access review (justification + demo video) | Brand verification only (**verify**) |
| Testable before verification | Yes, with up to 100 test users in Testing mode | Same | Same |
| Owner actions | Domain ownership of `parenthesisfamily.com` (#111); brand verification; publish app; submit | Same project and domain; its own data-access review; demo video | Add scopes; consent screen branding |

**Conflict to fix:** the Calendar runbook (section 4) says the Calendar scope is *sensitive*, but the console reading
recorded in the Photos tracker says *non-sensitive*. Re-check the console and correct the runbook.

Requirements shared by all three: the privacy notice on the verified domain names each Google use; the home page and
privacy notice are on `parenthesisfamily.com`; the consent screen's app name and logo match the brand (no logo changes).
Web and mobile use the **same Google Cloud project** but **separate OAuth clients** (web, iOS, Android); each mobile
client is tied to the bundle ID or package name and signing certificate (**verify** when creating them).

Google OAuth verification and Google Play review are separate processes with separate owners, checklists and timing.
They are tracked in separate issues.

### Sign in with Google and account linking

- Sign in with Google requests only `openid email profile`. It never grants Calendar or Photos access. Those scopes
  are still requested only when the parent presses Connect in Settings (incremental authorization).
- New account: Google identity with a verified email creates a parent account with no password; the parent can add
  one later.
- Existing account with the same email: never link automatically. The parent signs in with their password (or an
  email link), then confirms linking. This prevents account takeover through an unverified Google email.
- Sessions stay same-origin cookie sessions with antiforgery (ADR-0004); Google tokens are not session tokens.
- Unlinking requires another way to sign in (password set). Password recovery is unchanged.
- In native apps Google sign-in must use the system browser (ASWebAuthenticationSession / Custom Tabs), never an
  embedded web view: Google blocks OAuth in embedded web views.

### Maps

- Keep the server-side key, daily cap and budget alert. Add per-environment keys restricted by API and, for any
  browser key, by referrer. Mobile apps never embed an unrestricted key.
- Native: open locations in the platform's maps app (Google Maps or Apple Maps) through standard map links.
- No location permission is needed for suggestions; ask for device location only if a later feature needs it, and only
  when used.

## Epic B — Native mobile

### Recommendation: Capacitor around the existing Angular app

The frontend is a standalone Angular app with lazy routes, signals and Angular Material/CDK, already mobile first. A
rewrite (React Native, Flutter, Swift/Kotlin) would duplicate every screen and its tests. **Capacitor** packages the
same build as iOS and Android apps and adds native plugins (camera, files, share, push, secure storage, deep links),
so most code and the M5 design system carry over. Ionic components are not needed; keep Angular Material.

**Architecture decision needed before building (new ADR):** a Capacitor app is served from `capacitor://localhost`
(iOS) or `https://localhost` (Android), so API calls are **cross-origin**. That breaks the same-origin cookie and
antiforgery model of ADR-0004. Options to evaluate in the spike:
1. Native HTTP (Capacitor's HTTP plugin) with a native cookie store, keeping cookie sessions and antiforgery.
2. A mobile-only token flow (short-lived access token plus refresh token in the Keychain/Keystore), with the web staying
   on cookies.
3. Loading the hosted site inside the app shell. Simplest, but risks rejection as a thin website wrapper (Apple guideline
   4.2, **verify**) and weakens offline and native behaviour.
The ADR must keep tenant isolation, server-side authorization and the shared-device rules (ADR-0006, ADR-0007).

### Functional build requirements

Safe areas and notches; keyboard that doesn't cover inputs; Android back button; deep links (Universal Links / App
Links) for invitations, password reset and notification targets; camera and photo picker for event photos; file
download and share sheet for PDFs and exports; secure storage for any token; push notifications (APNs, FCM) for the
reminders in #198, only for events the parent can see; app icon and splash from approved brand assets only; dynamic
type and screen readers (VoiceOver, TalkBack); cold start under 3 seconds on a mid-range Android phone.

### Store approval requirements (separate from a working build)

| | Apple App Store | Google Play |
|---|---|---|
| Account | Apple Developer Program, US$99 per year (**verify**) | Play Console, one-time US$25 (**verify**) |
| Testing before release | TestFlight | New personal accounts must run a closed test (currently 12 testers for 14 days, **verify**); organisation accounts are exempt |
| Privacy | App Privacy details; privacy manifest for listed APIs | Data safety form |
| Accounts | In-app account deletion (exists: A-12) | Same, plus a web deletion link |
| Third-party sign-in | Offering Sign in with Google requires an equivalent privacy-focused option such as **Sign in with Apple** (guideline 4.8, **verify**) | — |
| Children | If the child experience ships in the app, Kids category rules or age rating apply | Families policy and target-audience declaration |
| Review | Human review; expect feedback rounds | Review per release |

Because the child experience (M8) is not in M6, the M6 store listings declare the app for parents only. Adding
children later changes the target audience and the review rules; plan that in M8.

## Issues

- #643 Epic A — Google integrations: verification, Maps hardening, scope check.
- #642 Sign in with Google and account linking.
- #644 Epic B — Native mobile apps with Capacitor, starting with the auth ADR spike.
- Existing: #111 Search Console and domain verification; #198 reminders and calendar feed; #61 photo storage (iCloud
  and native photo export remain).

## Acceptance

- Each Google integration has its verification status recorded with evidence in its runbook, and no integration is
  enabled in production before Google approves its scopes.
- Signing in with Google never grants Calendar or Photos access; linking an existing account needs the existing
  password or email confirmation.
- iOS and Android builds pass the parent core flows (sign-in, calendar, approvals, messages, records, essentials,
  memories) on real devices, with screen readers, in light and dark, in English and Spanish.
- The auth ADR is accepted before native sign-in ships, and server-side authorization is unchanged.
- Store submissions are tracked separately from the builds, with each store's feedback recorded.
