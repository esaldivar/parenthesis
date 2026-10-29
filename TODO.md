# Parenthesis TODO

The single list of work the owner has called a to-do, and of work left unfinished. **Rule:** whenever the owner says
something is a to-do, or work is left incomplete or deferred, it's added here, in the same change. Tick items off
(`[x]`) in the PR that finishes them, and add the date. In code, mark the exact spot with a `TODO(<area>):` comment
that points back here.

## Big projects
- [ ] **Daily Discord health summary (#114, October 28, 2026).** Workflow and regression tests prepared for monitor
  `804458679`, daily at 8 AM America/Chicago with automatic DST handling; existing outage alerts unchanged.
  - [ ] Review required PR checks and promote through the normal release route to `main` (scheduled workflows run there).
  - [ ] Run **Daily Discord health report** manually from `main`; verify real API metrics, Discord receipt and continued
    native outage/recovery notifications. Secret values and live delivery were not accessible during implementation.

- [ ] **Shared-device flow #153 (design PR #332; implementation branch `feat/153-shared-device-flow`,
  October 28, 2026).** Preserve every recorded visual approval (incl. the dark desktop recovery board, the four email
  concepts and the approved dark desktop states); unapproved supplements stay pending. Details:
  `docs/design/shared-device-state-audit-153.md` and [ADR-0007](docs/adr/0007-shared-devices-and-parent-pins.md).
  - [x] Server rules (implementation PR): explicit "Is this a shared family device?" setup after password sign-in;
    fixed 30-day expiry; picker shows only the setting-up parent and approved children; six-digit parent PIN;
    shared pause (3) → reset-required lock (3 more) for parent and child PINs, server-side and cross-device, race-safe;
    immediate child PIN reset by either parent with a notice to the other; parent PIN change after password
    confirmation; device-bound parent sessions ended by revocation, expiry or lost membership; switch profile versus
    full sign-out; four PIN emails through the existing `EmailTemplate` pipeline, reporting real send results.
    Backend integration tests and Vitest specs cover them.
  - [x] App screens using the existing design system and the unchanged approved icon: setup question/PIN form, parent
    PIN entry/pause/lock, child pause/lock, picker failure and expired/revoked state, parent PIN settings, device list
    expiry, child PIN reset, Switch profile and Sign out.
  - [x] ADR-0007 accepted by the owner (October 28, 2026), with the sign-out, takeover, PIN scope, lockout, reset-email
    and expiry-reminder confirmations recorded; implementation released to `develop` in #338.
  - [x] Owner decisions (October 28, 2026, PR conversation), implemented: single-use parent PIN reset link valid 15
    minutes, at most one parent-requested link per 15 minutes, still needing password sign-in and confirmation;
    paired child tablet opens straight to the PIN; "No" to shared setup remembered per browser and parent; devices
    registered before the change expire 30 days after registration.
  - [x] Owner fix after testing on `develop` (October 28, 2026): parents couldn't find the picker. Setup now ends at
    the picker (enter the PIN just chosen), shared devices show a visible Switch profile button, Sign out keeps the
    device and returns to the picker, and Settings offers "Stop sharing this device" for the browser in use.
  - [x] Owner approved the Switch profile header button (labelled on every size, kept in the account menu too) and
    the neutral "Stop sharing this device" confirmation, reusing existing components (October 28, 2026; boards in
    `docs/design/reviews/issue-153/picker-fix-2026-10-28/`).
  - [ ] Pending design review: new state supplements (R/P/E/D in `reviews/issue-153/states.html`), explicit
    mobile-dark/desktop-light reuse, parent lock, initial parent PIN form, notification-failure variants. The
    implemented screens follow the existing design system and are not claimed to match unapproved supplements.
  - [ ] Exact wordmark/lockup exports still unavailable: headers keep the approved icon plus the text wordmark
    (`shared/brand/logo.ts`, `TODO(brand)`); emails keep the CID icon plus text wordmark.
  - [ ] Email client testing (Gmail web/mobile, Outlook Windows/web, Apple Mail/iOS, both themes, images blocked) with
    real test sends; retry/outbox delivery (F-09) instead of log-and-continue.
  - [ ] Real screen reader, physical phones, 200% text/400% zoom, forced colors and reduced motion on the release
    candidate; live dev-site walkthrough of every #153 verification scenario.
  - [ ] Owner acceptance of #153 after testing the flow on `develop` (ADR-0007 itself is accepted), with the release
    PR's CI and SonarCloud analysis green; #153 stays open until then. Deferred: child
    personal-device sign-in, photos, QR pairing, push/in-app alerts, child-home redesign.
- [ ] **Open an event's location in Google Maps (#113, owner-approved stretch, October 29, 2026).**
  - [x] Event details show **Open in Google Maps** under Where: a Google Maps directions link
    (`https://www.google.com/maps/dir/?api=1&destination=…`, no API key), percent-encoded, opening in a new tab with no
    referrer. No embedded map, Maps SDK, location permission or tracking. Blank, punctuation-only or over-long
    locations stay plain text. The API already hides locations people mustn't see, and request logs leave out bodies.
  - [x] The Location field's hint asks for "the street, city and ZIP" so directions find the right place (owner,
    October 29, 2026). No address lookup or suggestions: the text goes to Google only when the link is tapped.
  - [x] Vitest (URL building, encoding, malformed input, details link, axe) and a Playwright check that the link opens
    Google's URL in a new tab with the right destination and no referrer (Google answered by a local stand-in).
  - [x] Follow-up opened as #354 (address suggestions while typing); see its entry below.
  - [ ] Real devices: iPhone (Safari, Google Maps installed and not), Android (Chrome, with and without the app),
    desktop browsers. Headless browsers can't show whether the Maps app opens.
  - [x] Owner approved the link's design as built (October 29, 2026; `docs/design/reviews/issue-113/`).
- [ ] **Address suggestions while typing a location (#354, owner decisions October 29, 2026).**
  - [x] Our API asks Google Places Autocomplete (New) with a server-side key; a picked suggestion saves its text only
    (no Place Details). Parents only, 60 a minute each; 300 Google requests a Pacific day; off without
    `Places__ApiKey` or with `Places__Enabled=false`; typed text and results never logged or stored.
  - [x] Location field suggestions on Add and Edit (combobox, keyboard, "Google Maps" attribution); plain text when
    off, capped or failing. Integration tests with a fake Google, Vitest and axe.
  - [x] Owner set up Google Cloud project `parenthesis-dev` (October 29, 2026): Places API (New) enabled, key
    `parenthesis-dev-places` restricted to Places API (New) only, no application restriction (server-side key).
  - [ ] Owner: when the Google Cloud **free trial is upgraded to a paid account**, lower the quota
    *AutocompletePlacesRequest per minute* from 12,000 to **10** (the free trial doesn't allow quota changes; it also
    doesn't charge the card). Google offers no per-day Autocomplete quota and no spend cap for Places, so the daily
    limit is Parenthesis's own 300 a day.
  - [ ] Owner: $1 alert-only budget (all services; spend caps aren't available for Places), then the key in the dev
    Key Vault and app settings ([runbook](docs/runbooks/google-places-suggestions.md)). Then try it on `develop`.
  - [x] Owner approved the suggestion list (October 29, 2026) with at most three suggestions and no embedded maps
    anywhere (`docs/design/reviews/issue-354/`).
  - [ ] Owner: before production, check the "Google Maps" text attribution against Google's current Places API (New)
    policies (owner decision: keep the text for the development site). Mention Google suggestions in the privacy
    notice once one exists.
  - [ ] Production stays off until the owner decides; revisit the cap and cost with real usage.
- [ ] **Fixed-date integration tests (#193, #259, October 28, 2026).** `EventSeriesTests` failed once its fixed date
  (October 28, 2026) passed; PR #346 pins its clock with `ApiFactory.Clock.SetUtcNow`. Do the same for the other
  classes on fixed 2026 dates before those pass: `CalendarTests`, `CalendarSearchTests`, `DateRuleTests`, `TaskTests`,
  `TaskChecklistTests`, `ReminderTests`.
- [ ] **Calendar event search (#253, October 28, 2026).** Search pill beside Today (magnifier, today's date in the
  family time zone); server search across history by title, event type, parent's parenting time and date; upcoming
  first, then a labelled Past events group, each paged. Parent-only endpoint; family-scoped `(family_id, ends_at)` index,
  no database extension (owner decision). Backend integration tests, Vitest specs, and headless Chromium screenshots at
  320/480/1280px in both themes done.
  - [ ] Real screen reader (VoiceOver), physical phone, enlarged text and forced colors against the release candidate.
  - [ ] Required PR CI, SonarCloud quality gate and owner acceptance; #253 stays open until accepted.
- [ ] **Release PR #321 Playwright follow-up (#278, #279).** Run 40444374496 recorded 224 passes and 30
  failures in the new mobile recovery scenarios. Correct Cancel URL, displayed date and empty-week fixture
  assumptions; preserve mutation, focus, date and DST assertions. The gate remains fail-closed. Extend the job
  and global timeout to 60 and 48 minutes respectively so a full run and diagnostics can complete.
  - [ ] Run the actual release candidate with all profiles, verify the results and review failed traces.
  - [ ] Verify selected palette cards in light/dark browser views; real-device and screen-reader checks remain open.

- [ ] **PR #321 remaining review and Playwright recovery (#255, #261, #278, #279).** Selected Add cards use a
  distinct tinted fill; palette keys are typed with documented aliases; dashboard palette mapping replaces shadowed
  subcategory fills; historical unknown-parent fallback differs from Unavailable. Prior #322 raw child-link fix verified.
  - [x] Frontend lint, 605 tests and production build; E2E typecheck, 8 report-policy tests and 254 discovered executions.
  - [ ] Run the exact release candidate in Chromium/WebKit after review. Time fields now use accessible labels;
    slot targeting follows the visible layout and waits for loaded controls. Action/navigation/global timeouts bound
    failures while retaining the gate and diagnostic time. No full browser execution claimed locally (Docker/.NET absent).
  - [ ] Verify selected/unselected controls and unknown-parent fallback visually in both themes; real screen reader and
    physical-device acceptance remain separate. Existing stylesheet warning remains, reduced to 10.86 kB.

- [ ] **PR #321 Copilot corrections (#255, #261).** Persist parent palette slots, use fixed dual-parent swatches,
  preserve status borders, retain raw child links and correct completion/style documentation in one fix PR.
  - [ ] Backend build/format/integration and migration verification in CI (.NET SDK/Docker unavailable locally).
  - [ ] Release-candidate browser verification, both themes, keyboard and real screen-reader acceptance.

- [ ] **Approved calendar palette (#255, October 26, 2026).** Light/dark event, task, reminder, activity, unavailable and stable parent colors implemented.
  - [ ] Complete browser/phone visual checks in both modes, keyboard and screen-reader acceptance against the release candidate.
  - [ ] Verify PR CI and owner review before merge; deployment and issue acceptance remain separate.
- [ ] **Home calendar child buttons (#261, October 26, 2026).** Replace grouping text with Show all kids and
  authorized child-name buttons; filter the week without changing schedules, keep shared/child-free events, retain
  selection across week/list changes, and reset when access or family changes. Focused frontend tests added.
  - [ ] Owner visual retest after review/promotion: desktop and 320px phone in both themes, long/many child names,
    keyboard/focus and real screen reader, enlarged text/reflow, reduced motion and forced colors. Local Chromium
    could not be installed (download returned an invalid ZIP); browser/layout/device checks remain unverified.
  - [ ] Required PR CI, owner acceptance and deployment remain separate; #261 stays open.
- [ ] **Dependency compatibility review (#275, October 26, 2026).** All three dependency PRs are already merged.
  Prepared a Docker build-stage correction to Node 24, matching `.nvmrc` and the frontend engine range;
  Node 25 is outside that range and is end of life. See `docs/runbooks/dependency-review-275.md`.
  - [ ] Review the correction and run the API image build/smoke check in CI; Docker is unavailable locally.
  - [ ] Finish upstream Actions runner/breaking-change review before signing off the entire issue.
- [x] **Dependabot release branch policy (#275, #277).** Reconcile the older Copilot branch with the active release:
  retain the separate edited-event branch-policy workflow, existing issue-link enforcement and full regression suite;
  allow same-repository dependabot/* only into valid release/x.y.z branches. Main/develop and fork restrictions stay.
  - [ ] Verify PR CI and the three dependency PRs' source checks after the reviewed policy becomes effective;
    dependency compatibility decisions and merge/deployment approval remain separate.
- [ ] **Owner testing and design readiness (#152).** Supervised implementation prepared: one waiting testing slot,
  owner acceptance/deployment evidence, priority rework with comments and fresh branches, explicit design/no-design
  readiness, and a local activation gate. See `docs/runbooks/claude-owner-testing.md`.
  - [ ] Review and merge the implementation PR through normal checks.
  - [ ] Owner-supervised live board/Windows smoke test, exact labels and built-in workflow configuration verified.
  - [ ] Owner explicitly approves installed-runner activation; keep off until then. No pilot #98 run implied.
- [ ] **Required tracking issues on every PR (#132, owner October 20, 2026).** Template, trusted-base read-only
  checker and tests prepared in the implementation PR. After owner-approved merges, verify live pass/fail behavior
  and require **Tracking issue links** on `release/*`, `develop` and `main`, preserving every existing rule.
  Existing open PR authors must identify relevant issues; no retroactive unrelated links. Details:
  [rollout runbook](docs/runbooks/pr-issue-links.md). Not enforced until branch settings are verified.
- [ ] **Require the `design approved` label on design PRs (owner, October 21, 2026).** Design handoff PRs (under
  `docs/design/`) need the owner's `design approved` label before they merge. Today nothing checks it: #163 was missing
  it and only the tracking-issues check held it. Add a required check (with tests) that fails a PR changing
  `docs/design/**` without the label, re-runs when labels change, and goes in its own reviewed PR, like other policy
  changes.
- [ ] **Account deletion (A-12, v0.3.0, first item; owner decisions October 20, 2026).** A parent can delete their own
  account, so real families can leave and the owner can rerun the sign-up flows.
  - [x] Built (October 20, 2026): Settings → Delete account. The parent re-enters their password and sees what will be
    removed; deletion is permanent at once (`POST /api/me/delete`). It removes the sign-in, name and email, and
    signs out; a wrong password counts toward the sign-in lockout.
    - **With a co-parent:** the family, children and shared history stay with them, and the departing parent shows
      as **"Former parent"** (no name kept). Their pending proposals are withdrawn. The co-parent's proposals that
      no longer need anyone else are applied, as in a one-parent family. Their Unavailable time, the household
      devices they registered, their unsent invitations, and the accepted invitation that held their email are
      removed.
    - **As the only parent:** the family goes too, with its children, devices, invitations, calendar and approvals.
    - **Emails:** a confirmation to the parent, and a neutral notice to the co-parent that names nobody: "A parent
      has left your family on Parenthesis." No personal data in logs (the audit rows hold ids only).
  - [x] Checked on the development site by the owner (October 21, 2026, after #139): deletion works.
  - [ ] **Family pictures stay (owner, October 20, 2026).** When memories and uploads arrive (v0.5.0, M-01 to M-06),
    a departing parent's photos and memories stay with the family if a co-parent remains: implement
    `IParentDepartureHandler` in that module so it keeps them (attributed to "Former parent") and deletes them only
    when the family is closing.
  - Until it's released, use a Gmail plus address (added to `Identity__SignUp__AllowedEmails`) for a fresh account
    on the development site.
- [ ] **SonarQube Cloud (Free plan) protecting `main`** (big to-do; owner decision, October 17, 2026). It gives code
  quality, security and vulnerability analysis at no cost. The plan only covers PRs into `main` and `main` itself,
  which is all that's needed. The paid plans and the self-hosted server were ruled out on cost.
  - [x] Pipeline ready: `.github/workflows/sonar.yml` runs on PRs into `main` and on `main`, and is skipped until
    it's connected (October 17, 2026).
  - [x] **Owner:** SonarQube Cloud organization and project created, and the token and keys added to GitHub
    (October 17, 2026).
  - [x] First analysis ran on release PR #27 (October 17, 2026). It found 1 vulnerability (fixed in #28) and 0%
    coverage, because no coverage reports were being sent yet.
  - [x] The quality gate (**SonarCloud Code Analysis**) and **SonarQube Cloud** are required checks on `main`, so a
    failing gate blocks releases (owner decision, October 17, 2026).
  - [x] Coverage reports go to Sonar: backend via `dotnet-coverage`, frontend via Vitest lcov (October 17, 2026).
  - [x] Quality gate green on release PR #27: security, reliability and maintainability all A, 98.6% coverage on new
    code (October 17, 2026).
  - [ ] **Weekly rhythm** (owner decision, October 17, 2026; release day changed October 18). Sonar Sunday issue →
    fix PR into the active release branch → the next biweekly release window (Release Tuesday was replaced). The
    workflows start running once they're on `main` (the next release). Then check the first automatic Sonar Sunday
    issue.
  - [x] **Owner:** in SonarCloud, mark the `tabindex` code smell on the calendar's scroll area as **Accepted**,
    with the reason "required so keyboard users can scroll the hours" (accepted, with the WCAG 2.1.1 comment,
    October 19, 2026).
  - [ ] Add the quality-gate badge to the README.
  - [ ] **Release security gate** (requested October 18, 2026): `release-gate` job in `sonar.yml`, policy and
    troubleshooting in `docs/runbooks/sonar-release-gate.md`.
    - [x] Gate, tests with a fake SonarQube Cloud API, docs and CLAUDE.md rules (October 18, 2026).
    - [ ] **Owner:** once it has run on a release PR, add **Release security gate** to `main`'s required status
      checks (steps in the runbook). Keep every existing protection.
    - [ ] Check the first real run: the scanner's task id is picked up and the API answers match the gate's
      expectations (it was tested against a fake API only).
    - [ ] Issue #65: the seven vulnerabilities on `main` block the next release until each is fixed or accepted in
      SonarQube Cloud with a reason. Fixed separately, not in the gate's PR.
      - [x] Six fixed in `fix/sonar-65-vulnerabilities` (October 18, 2026): `npm ci --ignore-scripts` and
        `npm run build` instead of `npx ng build`, in `docker/api.Dockerfile` and `ci.yml`.
      - [ ] **Owner:** the `HttpOnly` finding on the `XSRF-TOKEN` cookie (`AntiforgeryExtensions.cs:34`): mark it
        Accepted in SonarQube Cloud with the comment in that PR (Angular must read the cookie), or ask for a redesign.
      - [ ] After the release reaches `main`, check the six fixed findings closed, then close #65.
  - [ ] **Owner, optional:** install SonarQube for IDE (formerly SonarLint), which is free, in connected mode.
- [ ] **Branching model and protected branches** (requested October 17, 2026).
  - [x] `develop` created from the latest work (`feat/angular-shell`, which is now retired).
  - [x] CI runs on pushes to `develop`. The **PR source** check only lets `develop` or `hotfix/…` merge into `main`.
    The model is documented in CONTRIBUTING.md.
  - [x] Branch protection on `main` and `develop`: PRs only, required checks up to date, no force pushes or deletions, admins included (October 17, 2026).
  - [x] The **PR source** check also covers PRs into `develop` and re-runs when a PR is retargeted, in
    `.github/workflows/pr-branch-policy.yml` (October 17, 2026).
  - [x] Document the `design/…` and `feat/…` branch prefixes in CONTRIBUTING.md, and that **PR source** checks PRs
    into `develop` too (October 18, 2026, with the release-branch model below).
  - [ ] First release: now through `release/0.2.0` (see "Branching, releases and environments" below).

- [ ] **Deployment: development and production environments** (scoped October 17, 2026; planned October 18: Azure,
  confirmed by the owner. Pipeline and runbook in "Branching, releases and environments" below).
  - Two environments:
    - **Development**, deployed automatically from `develop`: the newest features, **synthetic data only**.
    - **Production**, deployed from `main` on each release: the stable version, with real families.
  - Each environment gets its **own database**. Development must never hold real family or child data.
  - Platform: Azure, as the architecture already chose (Container Apps, Azure Database for PostgreSQL, Blob Storage,
    Key Vault). Confirm this with the owner, including AWS as the alternative, when planning.
  - Keep costs low: small tiers, and check what Azure's free offers cover.
  - **Real email sending** for deployed environments. Mailpit only catches mail locally. Email is used for account
    confirmation, password resets and account-safety notices, and later for approval notifications.
    - **Owner decision (October 20, 2026): Brevo** (SMTP relay, free tier), not SendGrid (needs a paid plan) or Azure
      Communication Services. `parenthesisfamily.com` is authenticated in Brevo; mail comes from
      `no-reply@parenthesisfamily.com`. The app keeps its SMTP sender, so no Brevo-specific code.
    - [x] Branded HTML templates for every email (confirmation, already registered, password reset, co-parent
      invitation for new and existing users, child locked), one shared layout with a plain-text twin and a single
      link (October 20, 2026).
    - [ ] **Owner:** wire Brevo into the development app (runbook, "Email (Brevo)"), then sign up with a tester
      address to confirm delivery.
    - [ ] **Owner:** production Brevo SMTP key in the production Key Vault, same settings.
    - [ ] **Owner:** the development SMTP key (`brevo-smtp`) expires in October 2027; rotate it before then.
    - [ ] Before production: check what Brevo stores (recipients, subjects, bodies) and add it to the privacy notes.
      Emails carry first names, family names and links only, never diary, message or approval content.
    - Not built: a "forgot username" email. Sign-in uses the email address as the username, so there is no separate
      username to forget; "forgot password" covers it.
  - Domain names, HTTPS, the pipeline (deploy `develop` → dev, `main` → prod), secrets in Key Vault, database
    migrations on deploy, backups, monitoring.
  - **Uptime alerts (#114):** free UptimeRobot checks posting to Discord **#site-status**, $0/month for monitoring.
    Runbook: [uptime monitoring](docs/runbooks/uptime-monitoring.md). Dev checks every 60 minutes so the app can still
    scale to zero (owner decision, October 28, 2026).
    - [x] Runbook, and a test that `/health/ready` returns only `Healthy`/`Unhealthy` (October 28, 2026).
    - [ ] **Owner:** UptimeRobot Free account, Discord webhook for #site-status, and the `DEV · Parenthesis · ready`
      monitor (runbook "Setup").
    - [ ] **Owner:** run the outage and recovery test (runbook), and confirm the alerts look right.
    - [ ] **Owner:** add the `PROD · Parenthesis · ready` monitor once production has a public address; check its
      scaling first to choose the interval. Hard deadline: M4, before broader launch.

- [ ] **M2: onboarding, co-parent invitation, children, profile picker** (owner requirements, October 17, 2026).
  - **Sign-up and invitation:** after signing up, a parent invites the co-parent by email.
    - If the co-parent already has an account, the email says "join your co-parent's family", not "sign up".
    - The inviter is never told whether an account exists, so the invite box can't be used to look people up.
  - **Setup:** asks for the household size (how many children).
  - **Children:** either parent can add a child, but the child only exists once **both parents approve** (approval
    engine).
  - **Netflix-style profile picker** after login ("Who's using Parenthesis?"): a parent profile and each child's.
    - Children unlock with a short numeric PIN; parents use a longer password.
    - Parents can view the children's experience; children can never see parent data.
    - This changes the approved child-login design (separate child accounts activated by a one-time code), so it
      needs the decisions below first.
  - [x] **Owner decisions** (October 17, 2026):
    1. **Parent profile:** switching to a parent profile always asks for that parent's full password.
       **Child PIN:** locks after **3 wrong tries**, both parents are notified, and either parent can **tap to
       unlock**.
    2. **Children's own tablets:** yes, without a parent signing in on them. Proposed: device pairing.
       - A parent shows a short-lived one-time code or QR code on their own phone (about 10 minutes).
       - The tablet enters the code and is paired to that one child. After that, the child unlocks with their PIN.
       - Parents see and can instantly remove paired devices, and the same lock applies.
       - To confirm when building.
    3. **Diary:** private from parents (the current guardrail stays).
    4. **Before the co-parent joins:** children **aren't usable until both parents approve**. This replaces the
       architecture's "auto-confirm until the co-parent joins" for children.
    5. **Two existing families:** block and explain; no merging.
  - [x] Architecture updated for these decisions: ADR-0006, the solution architecture, ERD and backlog
    (October 17, 2026).
  - [x] **Owner** approved ADR-0006 (October 17, 2026).
  - [x] Backend: co-parent invitations (FM-03). "Join" vs "sign up" emails, no account lookup for the inviter,
    single-use and expiring links, revoke, two parents at most, never merging families (October 17, 2026).
  - [x] Backend: children approved by both parents (FM-04): the core of the Approvals module (ADR-0003) with the inbox, approve, reject and withdraw. Household setup adds one request per child (October 17, 2026).
  - [x] Backend: household devices, "Who's using Parenthesis?" profiles, kid PIN sign-in on registered devices only,
    the 3-strikes lock with an email to both parents and one-tap unlock, instant device removal and access disabling,
    and the kid-session gate (A-08–A-10, October 17, 2026).
  - [x] Backend: kid tablet pairing (A-11). A 10-minute single-use XXXX-XXXX code from a parent makes the tablet that one child's device and ends any parent session on it (October 17, 2026).
  - [x] Backend: changing a kid's existing PIN needs the co-parent's approval (ChildPinChange). The current PIN works
    until it's approved; reject or withdraw keeps it (October 17, 2026). Setting the first PIN and disabling access stay
    immediate.
  - [x] Frontend: re-fetch the antiforgery token whenever the profile changes (kid signs in, parent signs back in,
    sign-out, tablet pairing), in the auth store (October 18, 2026).
  - [x] Frontend: these screens, once Design Request #1 (issue #38) is approved.
    Approved October 18, 2026 (owner decisions: one parent tile per device, 7-day invitations with the email copy
    saying 7 days, one generic screen for expired/used/revoked links, 8-character pairing code typed in a text box,
    "We've let your parents know" for a locked PIN, initials and no age on child tiles). Delivered as small PRs into
    `develop`:
    - [x] Backend: a household device's picker shows only the parent who registered it, not both parents
      (October 18, 2026).
    - [x] Sign-up, household setup and invitations: register with confirm password, the four-step setup (family,
      how many children, their names, invite), "pending approval" for each child, the invitation accept page with
      one calm screen for invalid links, and a co-parent card in Settings (October 18, 2026).
    - [x] Second PR (owner decision October 18, 2026: Request #1 ships as two PRs to fit the weekly limit): profile
      picker, parent password and child PIN screens; tablet pairing and device management; co-parent approvals
      (October 18, 2026). **Owner decision, October 18:** a child's PIN is 4 to 6 digits, chosen by the parent; the
      child types it in one number box and taps "Go". The children list now returns each child's sign-in state, the
      approvals list says which requests you proposed, and the lock email links to Settings, where Unlock is.
  - [x] Check the Request #1 screens against the image mockups once they're committed: board added in #40, compared
    against the built screens' code (October 20, 2026). Decided differences and gaps are in the handoff
    (`docs/design/handoffs/SIGNUP_INVITATIONS_PROFILE_PICKER_2026-10-17.md`). Gaps from the board:
    - [x] "Decline all" on the co-parent's review of several new children: left out (owner, October 20, 2026).
      One decision per child; a bulk decline is easy to tap by mistake.
    - [ ] Illustrations on empty and confirmation screens ("No children added yet", "Invitation sent", emails):
      text-only until the owner approves an illustration set (owner, October 20, 2026); never generated stand-ins.
    - [ ] Phone or in-app alert for a locked PIN: email only for now; add it with notifications N-01/N-02 in v0.4.0
      (owner, October 20, 2026).
    - [x] "Invitation settings" row on the invite screen: dropped (owner, October 20, 2026). Nothing is configurable;
      invitations last 7 days and resend/cancel are in Settings.
    - The show/hide password eye is tracked under "Dashboard and design".
  - [ ] Parent tile: it asks for email and password, because the picker only knows the parent's name. Optional:
    remember the email on the device.
  - [ ] Approvals: a note can be added when declining only. Optional: a note when approving too (AP-05).
  - [ ] QR code for tablet pairing (deferred, owner decision October 18, 2026). Show the code only for now; adding a
    QR code needs a new library.
- [x] **Design ↔ code collaboration** (owner idea, October 17, 2026): ChatGPT designs, Claude codes, and the owner
  manages. There's no direct link between the two, so GitHub is the shared desk: `docs/design/handoffs/` and the
  `design` issue label. See that folder's README.
- [ ] **Optional, future: diary safety signals** (owner idea, October 17, 2026; needs careful design and ideally
  child-safety expert input).
  - The owner's idea was to secretly alert parents about worrying diary content.
  - Recommended instead: a **transparent** version. Children are told, in kid-friendly words, that the diary is
    private unless they write that they're in danger. The child immediately sees help resources. Parents get a
    "please check in with them" alert **without the diary text**.
  - Avoid secret monitoring: it breaks the child's trust, and keyword matching gives false alarms.
- [ ] **Mobile first** (owner: phone is the preferred way to use the app). Review every new screen at phone size
  first, in every milestone.
- [ ] **Installable app (PWA)** before the MVP. A native wrapper (e.g. Capacitor) is optional after the MVP.
- [ ] **Owner, via ChatGPT:** a synthetic mock photo set — fictional parent and child avatars, crayon-style kid
  artwork, people-free "memory" photos. **Never real children's photos or artwork:** the repository is public.
- [ ] **Owner, via ChatGPT:** mobile mockups first (dashboard, week calendar, propose and approve, bottom navigation
  and More). Then family setup and invitation, child profiles and Child Essentials, the full calendar, approvals and
  the memories gallery.

- [ ] **Project management in GitHub** (owner ideas, October 17, 2026). Recommended over Jira: free, and it links
  PRs to stories automatically.
  - [x] PR template (description, summary, type checkboxes, checklist), plus Story, Bug and Design request issue
    templates (October 17, 2026).
  - [ ] GitHub Projects board: Backlog → Ready for design → In design → Ready for dev → In progress → In review →
    Done. Needs the owner's OK; `gh` may need the `project` scope (`gh auth refresh -s project`).
  - [ ] Start each session by checking the board for *Ready for dev* stories (Claude) and *Ready for design* stories
    (ChatGPT, via the owner).
  - [x] ~~Later, optional: a Claude agent that reacts to GitHub issues automatically (paid API key).~~ Replaced by
    the local Claude queue on the owner's Claude subscription (#94, October 19, 2026): no API key.
  - [ ] **Local Claude queue** (#94). Runner, approval check, selector labels, CI for the Python tests, runbook
    (`docs/runbooks/claude-local-queue.md`).
    - [x] Labels `owner-approved-claude` and `claude-implementation` created; #95 (Actions scaffold) closed
      (October 19, 2026).
    - [x] **Owner:** deleted the `hotfix/claude-queue-execution-scaffold` branch (October 19, 2026).
    - [x] **Owner:** set `DISCORD_WEBHOOK_URL` as a user environment variable on the machine that runs the queue
      (runbook, "One-time setup") (October 19, 2026).
    - [x] Pilot issue: #98 (calendar validation tests), approved by the owner; `--plan` selected it (October 19, 2026).
    - [x] **Fully automated** (owner decision, October 19, 2026): an hourly Windows scheduled task on the owner's PC
      runs `--scheduled` (headless; quiet when idle; skips issues that already have a queue branch or PR;
      ordinary coding is exempt from the promotion cap after #134 activation; Discord notice when a draft PR opens or a run fails, once per problem; clears a crashed run's
      lock). Set up with `scripts/claude_queue_schedule.ps1`.
    - [ ] **Owner:** after this merges, run `scripts/claude_queue_schedule.ps1` once (runbook, "Running it on a
      schedule"). Task registration is already verified below. Pilot #98 is pending; coordinate #134 activation
      explicitly, since the removed broad cap must no longer be used as a safety hold.
    - [x] **Owner:** ran `scripts/claude_queue_schedule.ps1`; the task is registered (October 19, 2026).
    - [x] Fixed: every scheduled run failed under Task Scheduler (exit 120; "The handle is invalid" when the runner
      restarted itself after updating its checkout). Added `.git/claude-queue/last-scheduled-run.txt` so idle runs
      can be confirmed (October 19, 2026).
    - [x] Confirmed a real scheduled run after the fix: task result 0, status file updated (October 19, 2026).
    - [x] **Board sync** (owner decision, October 19, 2026): the queue keeps Project #2's Status in step with each
      issue's PRs (In Development, Awaiting PR Approval, Code Review, Awaiting Deployment, Done and closed; Backlog when
      every PR closed unmerged), for any open issue a PR links with a closing keyword. `scripts/claude_queue_board.py`.
    - [x] **Owner:** `gh auth refresh -s project` on the queue PC (October 19, 2026). First real sync moved #94 to
      Awaiting Deployment.
    - [x] Discord board updates (owner decision, October 19, 2026): one message per scheduled run listing each card
      moved (issue, title, old → new status, closed at Done); none when nothing moved.
    - [x] Fixed: a run that hits the Claude usage limit is paused, not stopped; it cleans up its worktree and branch,
      puts the card back to Ready For Development and is retried later. The Windows-only email test failure that
      stopped the #160 run was fixed in #164 (October 21, 2026).
    - [x] **Owner:** removed the #72 and #73 runs left by the usage limit, so the queue retries them (October 21, 2026).
    - [ ] Not yet verified end to end: the Claude permission rules in a real headless run, and a draft PR opened by a
      scheduled run. The Discord failure notice works (sent during the fix, October 19). Record the pilot on #94.
- [ ] **Notifications** (owner idea, October 17, 2026).
  - [ ] **Owner:** install the GitHub mobile app and watch the repo (PRs, issues, releases, failed checks). It's free.
  - [ ] Optional: a free Discord server with a `#dev-updates` channel fed by a GitHub webhook.
  - Meta AI has no known GitHub integration, so it isn't planned.

- [ ] **M3: the shared calendar** (started October 17, 2026; designs: Design Request #2, issue #48).
  - [x] Backend: Calendar module with create and list (C-01, AP-03), following CALENDAR_DECISIONS.md.
    - Parenting time, holidays and joint family events need both parents. A joint event waits even before the
      co-parent joins; the others are auto-confirmed and labelled while there's one parent (decision 7).
    - Activities and unavailable time are confirmed at once. Unavailable notes are private to their owner.
    - Kids see only confirmed events that include them.
  - [x] Backend: edit, cancel and swap (CalendarModify / CalendarCancel). Pending changes show before → after; there is
    a non-blocking warning when parenting time overlaps the other parent's unavailable time (October 17, 2026).
  - [x] Backend: overlap detection (C-06). Non-blocking warnings for double-booked parenting time, an unavailable
    caregiver, and unavailable time over your own parenting time (October 17, 2026).
  - [x] Backend: approvals history and decision comments (AP-04/05); request expiry after 14 days (AP-06) (October 17, 2026).
  - [x] Reminders' notifications (C-04) and the .ics feed (C-07): moved to M6 — Performance, Accessibility & Final
    Polish, as a stretch goal (owner decision, October 22, 2026); tracked in #198.
  - [x] **Repeating events (#193, C-05).** Built; the owner closes #193 after testing.
    - [x] Backend: weekly on chosen days for unavailable time and activities, ending on a date or after a number of
      times within a year, each date its own event; edit and cancel with This event / This and following / All
      events; series warnings (October 22, 2026).
    - [x] **Owner decisions (October 22, 2026):** unavailable time and activities can repeat (parenting time,
      holidays and family events stay one-off); a repeat always ends within a year; one form with a date preview.
    - [x] Frontend: Repeat in the Add form (activities and unavailable time) with a preview of the dates, the This
      event / This and following / All events choice when editing or cancelling, and "Repeats …" in the details
      (October 22, 2026).
    - [ ] Later: moving a series to other weekdays (cancel and add again for now), longer or open-ended repeats, and
      repeating parenting-time schedules (with approval).
  - [x] Frontend: the calendar page (October 21, 2026, from the 2026-10-20 handoff): Week (default), Month and List with
    real events in the family's time zone; child filter; loading, error and empty states; pending items labelled and
    hatched, "Change pending", "Confirmed before your co-parent joined", Unavailable in grey with private notes kept
    private; event details with Cancel (approval-gated for parenting time and family events); Add Event with the
    block-highlight type cards; calendar requests in the approvals inbox, linked from Calendar.
  - [x] Request Swap (October 21, 2026, from the approved board): new dates and times with an optional reason; a
    server check before sending, with **Send anyway** / **Choose different dates** when the other parent is
    unavailable; review (current → proposed); "Swap request sent"; request details with status and Withdraw. Owner
    decisions: the reason shows in the app only (never in email), and a swap changes dates and times only.
  - [x] **Reminders (#72)**, split into four queue-sized parts (all built October 22, 2026; the owner closes #72 after testing):
    - [x] #170 backend: one-off reminders, history, the "edited by" note and per-parent Seen (October 22, 2026).
    - [x] #171 backend: daily, weekly and monthly repeats with an end date or a number of times, in the family's
      time zone (October 22, 2026). Edits apply to the whole series.
    - [x] #172 frontend: reminders in Week, Month and List (bell icon, gold edge, "Reminder" label, child filter) and
      their details, with Seen on opening, the edited-by and seen-by notes, and Delete (October 22, 2026).
    - [x] #173 frontend: add and edit, with the Event / Task / Reminder choice (October 22, 2026).
    - [x] **Owner decisions (October 22, 2026):** a monthly reminder on the 29th–31st falls on the last day of shorter
      months (Jan 31 → Feb 28 → Mar 31); edits, deletes, Seen and history are per series in v0.3.0.
    - [ ] Later, if missed: change or delete a single occurrence of a repeating reminder (This one / This and following /
      All, like recurring unavailable time).
    - [x] **Owner decisions (October 22, 2026):** children don't see reminders (parents only; the child experience in
      v0.5.0 can revisit it); a real edit clears the other parent's Seen (the editor's stays).
  - [x] **Tasks (#73)**, split into four parts (all built October 22, 2026; the owner closes #73 after testing):
    - [x] #174 backend: shared tasks, Mark done (and undo), history, the "edited by" note and per-parent Seen
      (October 22, 2026).
    - [x] #175 backend: checklists with required and optional items, automatic completion and reopening, and a
      version check so neither parent's change is silently lost (October 22, 2026).
    - [x] #176 frontend: tasks in Week, Month and List, their details with the checklist, Mark done, Delete, the
      conflict refresh and the "Great teamwork!" celebration (October 22, 2026).
    - [x] #177 frontend: add and edit a task, with its checklist (add, remove, reorder with Move up/down, required or
      optional), and the "load their latest version" path when the other parent changed it first (October 22, 2026).
    - [x] **Owner decisions (October 22, 2026):** children don't see tasks (parents only; child sessions get 403). Mark
      done and undo are recorded in history but aren't edits: they keep both parents' Seen and don't set "edited by".
      A real edit clears the other parent's Seen, as for reminders. A checklist with no required items is done when
      every item is ticked. Adding, renaming, reordering or removing items is an ordinary edit by either parent, and
      completion is recalculated (removing the last unticked required item completes the task; adding one reopens it).
  - [x] Frontend: edit an event (#188, October 22, 2026): title, when, place, notes and the caregiver, from the event's
    details. Parenting time, holidays and family events send a change for approval ("Change pending"); notes and
    other events change at once; the form says which before saving.
  - [x] **Declined requests on the calendar (#199, October 22, 2026).** A declined new event shows to both parents
    as **Declined** (struck through, labelled, never like a confirmed or pending item), with who declined it, when and
    their comment, and **Remove from my calendar**, which changes only that parent's calendar. It also drops off once
    its dates pass. Children never see it; it never counts in conflict checks; the home page leaves it out. A
    **Declined** approval filter is on by default (saved filters from before start with it ticked).
    - [x] **Owner decisions (October 22, 2026):** declined new events only (a declined change or swap leaves the event
      as it was, and its outcome stays in the approvals history); both parents see it; it stays until removed or
      past; the filter option is on by default.
    - Withdrawn and expired requests still just disappear. Requests declined before this change aren't marked, so
      they don't reappear.
  - [ ] Changing an event's children after it's created (the API doesn't support it yet).
  - [x] Frontend: the dashboard's live data source (#196).
    - [ ] **Home calendar shows every event (#208, critical):** on desktop the week grid left out all-day events (an
      all-day activity, a holiday, a day of unavailable time), and a multi-day event showed on its first day only. They
      now sit in the all-day row across their dates. **Owner:** retest on the development site, then close #208.
  - [ ] **A parent can't have the children and be unavailable at once (#210).** Built on
    `feat/210-block-own-overlaps`: the API refuses parenting time over its caregiver's unavailable time (whoever adds
    it) and unavailable time over the owner's pending or confirmed parenting time, for new items, repeating ones and
    edits that change times or the caregiver; a series is checked whole. A swap into the caregiver's unavailable time
    has no Send anyway. Existing overlaps stay; title and notes edits still work.
    - [x] **Owner decisions (October 22, 2026):** pending parenting time counts (declined and withdrawn don't); it
      applies whoever adds it; existing overlaps are left alone.
    - [ ] **Owner:** test it on the development site, then close #210.
  - [ ] **Approve or decline from an event's details (#218).** Built on `feat/218-decide-from-details`: the parent who
    can decide sees Approve and Decline… (with an optional comment) on a pending event, change, swap or cancellation,
    using the same approvals API as the inbox; the proposer still sees only Withdraw. A request answered elsewhere
    shows calmly with no stale buttons. Unit tests and a browser journey (Mom approves from the details).
    - [ ] **Owner:** test it on the development site, then close #218.
  - [ ] **Open an event's details from its block (#213, critical).** On `feat/213-open-event-details`: every event and
    parenting-time block on the home page (week grid, all-day row and day list) opens the same details sheet as the
    Calendar page, loaded fresh, with focus back on the block when it closes; an event that's gone says so and the
    week refreshes. The Calendar page's Week, Month and List items already opened details (audited, now tested).
    - [ ] **Owner:** retest on the development site after #208, then close #213.
  - [ ] **Tap empty calendar space to add (#212, critical).** On `feat/213-open-event-details`: on the Calendar page
    (Week, Month, all-day row, day lists) and the home week, tapping empty space opens Add with the date, and on a
    week's time grid the half-hour tapped (an hour long). Keyboards use each day column's "Add on …" button. Defaults
    are in `docs/design/CALENDAR_DECISIONS.md`.
    - [ ] **Owner:** retest on Home and the Calendar page (phone and desktop), then close #212.
  - [ ] **Toasts for successful actions (#226).** On `feat/226-toast-notifications`: confirmations on the Calendar,
    Home, Approvals and family pages show as a toast, bottom right on desktop and above the bottom navigation on phones.
    They show 6 seconds for short messages and up to 10 for long ones, pause while hovered, focused or the tab is
    hidden, and have a Close button. Errors stay inline.
    - [ ] **Owner:** try it on the development site (phone and desktop), adjust the timing if wanted, then close #226.
  - [ ] **Date ranges (#232).** On `feat/232-date-ranges`: one range calendar on Add, Edit and Request Swap (single
    pickers for a repeat's last day, reminders and task due dates). Days before today (family time zone) are greyed out
    and refused, also by the server; earlier times today are fine; moving the start past the end moves the end with it;
    an event, reminder or task already in the past keeps its own day when edited.
    - [x] **Owner decisions (October 23, 2026):** move the end with the start; past items keep their dates; earlier
      today is allowed; one range calendar.
    - [ ] Follow-up to consider: a request still waiting for approval whose dates have passed.
    - [ ] **Owner:** try it on the development site (phone and desktop), then close #232.
  - [ ] **Invited co-parent joins the existing family (#211, critical).** Fixed on `fix/211-invited-co-parent-joins-family`:
    a "Sign up to join" link opened while someone else is signed in on that browser keeps its invitation and goes to
    it (it was dropped, so the new account landed in new-family setup), and a signed-in parent with no family goes to
    a waiting invitation before new-family setup. Browser regression tests in
    `specs/regression/issue-211-invited-co-parent-joins-existing-family.spec.ts`; backend ones in `InvitationTests`.
    - [ ] **Owner:** retest on the development site with two separate browser profiles, and confirm both parents see
      the same family and children, before closing #211.
  - [x] **Calendar filters (#190, design #162).** Built; the owner closes #190 after testing.
    - [x] Type, parent (created by / involving) and approval filters with Reset filters, removable chips, a
      filtered-empty state, and choices remembered in this browser per parent and family (October 22, 2026).
    - [x] **Owner decisions (October 22, 2026):** items about no child still show under one child; nothing ticked in a
      dimension matches nothing (with Reset); filters are remembered in the browser, not the account.
    - [x] Hidden Unavailable markers: a thin strip in Week (widening on hover or focus), a dashed "Hidden: unavailable"
      row on phones, in Month and List; they open the details, which offer a swap only when the time overlaps that
      parent's confirmed parenting time (October 22, 2026).
    - [ ] Later, separate issue: named saved filter presets (out of scope for #162).
  - [x] Design handoff and boards: `docs/design/handoffs/2026-10-20-calendar.md` and `docs/design/assets/calendar/`
    (#148), moved from `release/0.4.0` to `release/0.3.0` by owner decision (October 21, 2026).
    - [x] **Owner:** uploaded the approved Request Swap board (October 21, 2026).
    - [x] **Owner decisions** (October 21, 2026, recorded in the handoff): no attachments in v0.3.0; shared tasks
      with no assignee that complete when the last required item is ticked (or **Mark done** without a checklist);
      reminders repeat but have no location; either parent edits or deletes tasks and reminders at once.
    - [ ] Attachments on calendar items, with uploads and storage in v0.5.0 (#115).
    - [ ] **Owner:** delete `release/0.4.0` once the handoff is in `release/0.3.0`; cut it fresh for v0.4.0.

- [ ] **Playwright release gate on `develop`** (owner decision, October 18, 2026). Every `release/x.y.z` → `develop`
  PR runs Playwright against the release candidate, for the current milestone and every one before it. Runbook:
  `docs/runbooks/playwright-release-gate.md`.
  - [x] Suite in `tests/e2e/` (v0.1.0, v0.2.0, the v0.3.0 work already in `develop`, and a regression test for #58),
    workflow `.github/workflows/playwright-release.yml`, the **Release E2E gate** check and its Discord post through
    `DISCORD_WEBHOOK_URL` (October 18, 2026).
  - [x] **Owner:** **Release E2E gate** is a required check on `develop` (October 18, 2026).
  - [x] Get the workflow onto `develop`. It existed only on `release/0.2.0`, so PRs into `develop` waited forever
    for the required check (seen on #81, October 19, 2026):
    - [x] Merge `develop` into `release/0.2.0` (merge commit, not squash) to clear the release PR's conflicts (#82).
    - [x] `release/0.2.0` → `develop` opened early at the owner's request and merged (#88, October 19, 2026).
    - [x] Updated #81 from `develop`; its **Release E2E gate** reported and passed, and it merged (October 19, 2026).
    - [x] **Owner:** deleted the stale `release/0.3.0`; a fresh `release/0.3.0` was cut from `develop`
      (October 19, 2026).
  - [x] First real run on the `release/0.2.0` → `develop` PR (#88, October 19, 2026): Playwright passed in about
    4 minutes, the summary ran, the HTML report and summary artifacts were uploaded, and the Discord post was sent.
  - [x] Moved `actions/upload-artifact` (v4 → v7) and `actions/download-artifact` (v4 → v8) in
    `playwright-release.yml` to Node.js 24 (GitHub warned on #88's run). Only new optional inputs; defaults unchanged
    (October 19, 2026).
- [x] **Owner:** prune inactive branches (owner request, October 19, 2026). Claude listed merged or abandoned
  branches with their PRs; the owner deleted 28 (24 with merged PRs, 3 duplicates already in `develop`, and the
  superseded `docs/dev-workflow-automation`). Kept: `main`, `develop`, `release/0.2.0` (until v0.2.0 reaches
  production), `release/0.3.0` and `design/signup-invitations-profile-picker` (#40 open). Claude Code sessions
  can't delete branches (the proxy returns 403), so the owner deletes them.
  - [x] **Owner:** turned on Settings → General → "Automatically delete head branches" (October 19, 2026).
  - [ ] Add browser journeys as the v0.2.0 and v0.3.0 screens ship (invitations, children, profile picker, PIN
    entry, the full calendar). Until then those features are tested through the API, and the calendar page through
    its honest empty state.
    - [x] v0.2.0: the profile picker, PIN entry (tries left), switching profile, approving a PIN change in the inbox,
      and pairing a tablet, in `specs/m2-accounts/profiles-in-the-browser.spec.ts` (October 18, 2026).
    - [x] v0.3.0 calendar screens, in `specs/m3-calendar/calendar-in-the-browser.spec.ts` (October 22, 2026): adding
      and editing an activity, parenting time approved in the co-parent's inbox, a declined request with its decision
      and Remove from my calendar, repeating unavailable time with its preview, filters remembered after a reload and
      reset, and the home page's real week with reminders and tasks in Upcoming. The two older calendar tests were
      updated for the shipped calendar and for declined requests (#199), which would otherwise have failed the
      release gate.
    - [ ] Invitations in the browser: the same-browser invitation journeys are covered by the #211 regression tests;
      resending, cancelling and expired links still aren't.
  - [ ] If the suite outgrows the fixed child-PIN rate limit (30 a minute per address), make it configurable like
    the sign-in limit, for the test instance only.

- [ ] **Development workflow automation** (owner brief, October 18, 2026). Weekly PR and Copilot review limits,
  Discord notifications for major and release PRs, and a weekly status report. The brief is in CLAUDE.md.
  - [ ] **Release-promotion-only weekly cap (#134, owner correction October 20, 2026).** Only `release/*` → `develop`
    PRs count toward three per week. Ordinary work is exempt at admission and pre-PR recheck. Tested implementation
    is in a separate PR; owner-approved merges and coordinated installed-runner activation remain pending.
    Do not start #98 as a test or change/disable the task without authorization.
  - [x] Brief recorded in CLAUDE.md (October 18, 2026).
  - [x] Inspection report to the owner (CLAUDE.md step 11), October 18, 2026.
  - [x] **Owner settings** (October 18, 2026): `DISCORD_WEBHOOK_URL` is a repository Actions secret (the plain-text
    variable copy was deleted); the `main` ruleset "Copilot review for default branch" now requires 0 approvals (it
    required 2 with no bypass, which would have blocked releases); Copilot review effort is **Lite**; "Allow Copilot
    to approve pull requests" is **off**; there are no Copilot automatic-review rulesets.
  - [x] Owner approved the build (October 18, 2026).
  - [x] Built: `pr-weekly-limit.yml`, `copilot-review-usage.yml`, `discord-pr-notify.yml`, `weekly-dev-status.yml`,
    `workflow-scripts.yml`, `.github/scripts/dev-workflow.mjs` with tests, `docs/development-workflow.md`; CLAUDE.md
    now links to it (October 18, 2026).
  - [ ] **Owner:** once the **Weekly PR limit** check has run on a PR into `develop`, make it a required check there
    (Settings → Branches → `develop`), so PRs over the limit can't merge without `owner-approved-pr`.
  - [x] **Owner setting: Copilot review on release PRs** (owner decision, October 20, 2026; created October 20). Settings → Rules →
    Rulesets → New branch ruleset named **Copilot release review**, target `develop`: turn on **Automatically
    request Copilot code review** with **Review new pushes** off, and in "Require a pull request before merging" turn
    on **Require conversation resolution before merging**. Don't change the other `develop` rules. Save it with
    Enforcement status **Disabled**; it's set to Active only while a release PR is open (see
    `docs/development-workflow.md`). The usage script already leaves these reviews out of the weekly count.
  - [ ] Watch the first real runs: the first major or release PR notice, the first over-limit PR, and the first
    Monday report (it only runs once this is released to `main`).

- [ ] **Branching, releases and environments** (owner brief and decisions, October 18, 2026). Rules in
  `docs/development-workflow.md`.
  - [x] Brief recorded in CLAUDE.md, with the discrepancies against the current process (October 18, 2026).
  - [x] **Owner decisions** (October 18, 2026): keep `develop` (no rename to `development`); biweekly Friday
    windows from October 30, replacing Release Tuesday; November 25 and December 23 replace the holiday Fridays;
    work goes through `release/x.y.z` branches, including tooling and docs; the owner's milestone list is the release
    structure and the backlog is re-mapped to it; cut `release/0.2.0` from `develop` as it is; Azure hosting (no
    subscription yet); invite-only accounts on the development site; the existing Discord webhook secret.
  - [x] Built (October 18, 2026): the **PR source** policy for `release/*` and the stricter `develop`;
    `release-window.yml` with `.github/release-windows.json`; `deploy.yml` (dormant until `DEPLOY_ENABLED`);
    production promotes the image tested on `develop`; release PRs into `develop` count as release notices in
    `dev-workflow.mjs`; CONTRIBUTING.md, `docs/development-workflow.md`, the Azure runbook and the backlog's release
    map; CLAUDE.md now links to the workflow guide.
  - [x] Cut `release/0.2.0` from `develop` once this is merged, and retarget open work PRs (#40, #59) to it
    (October 18, 2026).
  - [x] Draft v0.2.0 release notes: `docs/releases/v0.2.0.md` (October 19, 2026).
  - [x] Removed the one-off `chore/release-workflow` exception from `.github/scripts/check-pr-branch-policy.sh` in
    the first PR into `release/0.2.0` (October 18, 2026).
  - [x] **Owner:** GitHub settings from the runbook (October 18, 2026): the `release branches` ruleset (PRs only,
    the four checks up to date, no deletion or force pushes, checks not required on creation); **PR source** required
    on `develop`; the `development` environment (deploys from `develop` only) and the `production` environment (owner
    as required reviewer, self-review allowed, no admin bypass, deploys from `main` only). The environment variables
    wait for the Azure setup.
  - [x] **Owner:** Azure account (free trial, $25 monthly budget with alerts) and the **development** environment
    (runbook steps 1–3 with `ENV=dev`, `SUFFIX=15465`): resource group, logs, Application Insights, Container Apps
    environment, PostgreSQL 17, Key Vault, storage, the app and its migration job, Key Vault references, the GitHub
    `development` variables and `DEPLOY_ENABLED` = `true` (October 19, 2026).
  - [x] First deployment to the development site, through the `chore/sync-main` back-merge (#105, October 19, 2026).
  - [ ] Development deployment passes again after `release/0.3.0` → `develop` (#117): the sign-up email is branded
    and sign-ins survive a restart.
  - [ ] **Owner:** the **production** environment before the first production window (October 30, 2026): runbook
    steps 2–3 with `ENV=prod`, the GitHub `production` variables, and the production readers' role assignments.
  - [x] **Owner:** people and roles (runbook step 3a, owner request October 19, 2026): Entra groups
    `parenthesis-dev-contributors` (Contributor on dev and Key Vault Secrets Officer on the dev vault; the owner is a
    member) and `parenthesis-prod-readers` (created; empty until production exists) (October 19, 2026).
  - [ ] **Owner:** assign `parenthesis-prod-readers` its roles once production exists, and move daily work to an
    everyday account, keeping the Owner account for emergencies.
  - [x] **Owner:** Application Insights prep for development (runbook step 2): 0.5 GB daily ingestion cap and the
    `appinsights` Key Vault secret (October 19, 2026). Production gets the same with `ENV=prod`.
  - [ ] Wire up Application Insights in the API (owner plans this soon): read `APPLICATIONINSIGHTS_CONNECTION_STRING`
    from `secretref:appinsights`, no personal data in telemetry, then add the app setting in each environment.
  - [x] Invite-only sign-up on the development site: an allow-list of tester emails, configured per environment
    (application change in Identity, v0.2.0). `Identity:SignUp:InviteOnly` and `AllowedEmails`; off by default, so
    production stays open (October 19, 2026).
  - [x] **Owner:** set the development site's tester list (Azure runbook, "Development only: invite-only sign-up";
    October 19, 2026).
  - [x] Before v0.2.0 reaches production: check that the unfinished Milestone 3 work already in `develop` isn't
    reachable in the app (October 19, 2026). Nothing is: the calendar page is an honest empty state, the dashboard
    shows "not available yet" (its sample data only in development builds), Quick Add is disabled with a note, the
    approvals inbox shows child requests only, the kid space has no calendar, and Swagger is development-only. The
    calendar API itself stays on (**owner decision**, October 19): it's signed-in, family-scoped and tested, sends no
    email, and v0.3.0 needs it; only a parent calling it by hand could reach it.
  - [ ] Watch the first runs: the first release-window issue (Monday, October 26 is the first release-week Monday,
    but scheduled runs need this on `main`, so run it by hand until then), the first development deployment and
    the first production deployment and rollback drill.
  - [ ] Infrastructure as code (S-03): the runbook's commands as Bicep, once the environments exist.

## Dashboard and design
- [ ] **Product README and documentation navigation (#84).** Product landing page, local setup/API guides and
  documentation index prepared October 26, 2026; approved icon reused unchanged, planned features distinguished
  from current work. Verify rendered GitHub desktop/phone views in both themes before acceptance. Corrected
  horizontal wordmark remains pending below; add a gallery only when real synthetic screenshots are approved.
- [x] **Home week navigation (#208).** Previous/Next/Today preserve the shown week in the URL, including existing
  query parameters; Settings followed by Back restores that week. Linked-week navigation replaces an earlier
  local selection. Router regressions cover both journeys.
  - [ ] After promotion, retest the actual Settings/appearance/Back and reload journey on development. This repair
    does not establish the remaining original missing-events, mobile or screen-reader acceptance criteria.
- [x] **Upcoming load states (#208).** Show loading and failed-load messages separately from an empty week;
  offer retry and hide the previous week's Upcoming items while changing weeks. Regression coverage includes
  delayed responses, failures, successful retries and unavailable family data.
  - [ ] After promotion, retest on development at phone and desktop sizes in both themes, with keyboard and a
    screen reader. Reproduce the owner's original missing-events report and record deployed commit, week,
    time zone, household setup and owner retest before acceptance; this fixes only the confirmed load-state gap.
- [ ] Corrected horizontal logo SVGs from ChatGPT (`parenthesis-logo-horizontal.svg`, `-dark.svg`). The requirements
  are in `src/frontend/src/app/shared/brand/logo.ts` (`TODO(brand)`).
- [ ] Commit the exact approved dashboard image as `docs/design/assets/approved-dashboard-2026-10-16.png`, or confirm
  that `3116E10A-….png` is it.
- [ ] Choose the rounded brand typeface (open in `docs/design/BRANDING.md`).
- [ ] Recent Messages: decide whether the card shows messages from the children (as in the mockup) or from the other
  parent (current sample).
- [ ] Replace placeholder counts (`src/frontend/src/app/layout/sample-counts.ts`) with real unread and notification
  data.
- [ ] Deferred (owner OK for now): photo avatars, kids' artwork and memory photos (initials and tiles are used).
- [ ] Show/hide password toggle (eye icon) on every password field: sign-in, create account, reset password and
  change password (owner request, October 20, 2026). A real button inside the field with an accessible name that
  says what it does ("Show password" / "Hide password", `aria-pressed`), reachable by keyboard, never submits the
  form, and the password goes back to hidden after submitting. Use the shared form components; check both themes and
  320px.

## Calendar follow-ups

- [x] **Reject explicitly blank event edit titles (#273; #98).** Single and recurring edits distinguish omitted
  titles from explicitly empty/whitespace titles. Required titles are rejected without saving other fields;
  omitted/null titles keep their values and Unavailable time retains its generic label and private notes.
  The Edit form requires parenting-time titles too. Regression tests cover validation, scope atomicity,
  omitted-title updates, privacy, accessible feedback and correction without losing input.
  - [ ] Run backend build/format/integration and frontend lint/test/build in PR CI; this workspace has no .NET SDK
    or Docker. After promotion, retest mobile/desktop, both themes and screen-reader behavior before acceptance.

- [x] **Reminder delete confirmation focus (#172).** Opening confirmation focuses Keep it with the deletion
  explanation; cancelling restores Delete reminder. The pending delete action keeps focus and blocks duplicate
  requests, including error/retry. Regression tests cover the observed BODY-focus failure and error-state axe.
  - [ ] After promotion, manually retest the confirmation, cancellation, failed and successful deletion by keyboard
    and screen reader on development, phone/desktop and both themes. Independent-parent checks remain open.

- [x] **Monthly reminder boundary coverage (#171).** Expand the January 31 integration scenario to January
  29/30/31 in both non-leap and leap years, verifying February clamping, recovery of the original monthly day,
  range splitting, four-occurrence count and local time across the spring daylight-saving boundary.
  - [ ] Run the new cases in backend CI (this workspace has no dotnet/Docker), and retain the remaining manual
    two-parent/accessibility acceptance checks. The live October 31 to November 30 reminder was verified separately.

- [x] **Task action keyboard focus (#73, #176).** Checklist saves preserve the checkbox's focus using aria-disabled
  with a duplicate-action guard. Checklist-free completion retains the same Material button across Mark done/Undo,
  including its pending state. Delete confirmation focuses Keep it and restores Delete on cancellation; a pending
  deletion retains focus and guards duplicates. Tests cover pending, successful and failed saves and duplicate actions.
  - [ ] After promotion, repeat the observed development-site Space/Enter test with keyboard and screen reader,
    both themes and phone/desktop. The original build drops focus to BODY after a task mutation; independent
    parent/household acceptance checks remain open.

- [x] **Reminder validation descriptions (#206, #173).** Associate date/time and repeat refusal messages with
  their own Material controls; give a missing time its own message and retain hidden date-format guidance when
  valid. Regression tests cover local and server refusals, focus, retry correction and all-day reminders.
  - [ ] After promotion, manually retest Add/Edit reminders on development with keyboard and a screen reader,
    in both themes and at phone/desktop sizes. This implementation does not close either issue's full acceptance.

- [x] **Silent lazy-page navigation failures (#177).** A shared accessible recovery dialog explains a failed
  page load and offers an explicit reload with an unsaved-changes warning, or Keep working. No automatic reload,
  retry loop, failed URL or technical exception is exposed. Regression tests include an existing focus trap.
  - [ ] After promotion, reproduce a missing lazy chunk in a stale development tab, verify the recovery and
    successful Edit after reload, and check phone/themes/screen-reader behavior. Asset-retention/deployment causes
    remain unconfirmed; the recovery does not establish that old chunks remain available.

- [ ] **Change several dates of repeating parenting time at once, through approval (#239 follow-up, October 23,
  2026).** Repeating parenting time is approved as one request for the whole series. Changing or cancelling it is
  one date at a time for now: each change goes to the co-parent as usual. "This and following" and "All events" are
  hidden for it, and the server refuses them (`OneDateAtATime` in `CalendarEndpoints`), because applying them at
  once would skip the co-parent. Build one approval request covering every date it changes, as for creating.
- [ ] **Name the clashing date in own-overlap refusals (#259 follow-up, October 23, 2026).** A repeating series that
  can't be added because the parent is unavailable (or has parenting time) on one of its dates is refused whole, with
  a general sentence. Say which date clashes first ("Wed, Nov 4"), from authorized information only, never the
  unavailable time's private details. The server's caregiver message also still says "or another parent", which
  #246 made impossible; the form shows its own wording, so only API clients see it.

## Backend features the dashboard is waiting on
- [ ] Calendar and parenting-time endpoints, including change requests and approvals.
- [ ] Family events (both parents attend) and parent unavailability. These are UI-only mock categories today.
- [ ] Kid shares, messages, memories, and notification/unread APIs.

## Platform hardening (from the architecture backlog)
- [ ] F-09 transactional outbox.
- [x] S-01 data-protection key ring: keys stored in PostgreSQL (`data_protection.keys`), shared by every replica and
  restart, so sign-ins, antiforgery tokens and email links survive scaling, waking from zero and deploys. Found when
  sign-up on the development site failed with "Invalid or missing antiforgery token" after a restart (October 20, 2026).
- [ ] Before production: encrypt the key ring at rest with a Key Vault key (`ProtectKeysWithAzureKeyVault`, the app's
  managed identity). Today the keys rely on database access control only, and ASP.NET Core logs a warning about it.
- [x] S-03 forwarded headers behind the proxy: `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` on each container app
  (runbook step 2), found when sign-up failed on the development site (October 20, 2026).

- [x] **Date-format accessibility (#236).** Typed reminder/task dates and repeat last-day fields retain a
  screen-reader-only format hint; regression tests verify its actual accessible-description association.
  - [ ] Retest with a screen reader and on the development site after promotion; implementation tests are not owner acceptance.

### #238 — Cancellation confirmation focus
- Implemented: single and recurring event cancellation focuses the safe Keep action with its explanation; keeping the event restores Cancel event. Repeated transitions and no-mutation/axe regressions cover both branches.
- Still required: owner live keyboard retest after deployment and remaining phone/screen-reader recurrence acceptance.

### #218 — Withdrawal confirmation focus
- Implemented: opening Withdraw focuses Keep it with the confirmation explanation; Keep it restores the withdrawal trigger. Repeated transitions, no mutation on cancellation and axe are covered.
- Still required: owner keyboard retest after deployment and the remaining mobile/screen-reader/approval matrix.

### #206 — Edit invalid-date focus
- Implemented: refused-save focus recognizes the rendered invalid date while Material and DateField synchronize aria-invalid. Regression fails without the fix; repeated all-day Edit submissions focus End date and preserve input without PATCH.
- Still required: owner retest of the picker/keyboard reproduction after deployment, plus phone scrolling and actual screen-reader checks.

### #213 — Fresh event details
- Implemented: Calendar Week/Month/List and event links load current event details before opening the shared panel. Unavailable/cancelled events show feedback and refresh; failed loads never fall back to cached actions. Older responses cannot replace a newer selection or reopen a previous week. Home already uses fresh details. Declined request details follow the same per-parent visibility as the list, including dismissal.
- Still required: owner stale-tab scenario after deployment and outstanding mobile/assistive-technology acceptance.

### #260 — Caregiver authorization
- Implemented: generic parenting-time edits/cancellations require the persisted caregiver, before notes or proposals change. UI uses the same caregiver rule; Request Swap uses a separate dates-only endpoint and remains available to the other parent. Added frontend and API regression coverage for legacy creators, both parent identities, recurring scopes and swap approval/withdrawal.
- Still required: backend CI validation and owner acceptance after promotion to the test environment; no acceptance or deployment claim.

### #210 — Family-event availability choice
- Implemented: before sending a family event, a read-only availability check offers Send anyway or Choose different dates for confirmed other-parent unavailability. Draft changes invalidate that choice; stale checks cannot submit an older draft, and failed checks preserve input without saving. Private notes never enter the warning. Joint-event API responses also include the existing non-blocking warning code.
- Still required: backend CI and owner live warning/approval retest after promotion; existing same-parent blocking and remaining acceptance evidence are retained.

### #137 — Account review cancellation focus
- Implemented: Cancel restores Delete account after rendering the closed state. Repeated-review regression retains initial consequence-warning focus, clears the form, stays in Settings and never calls deletion.
- Still required: owner cancellation keyboard retest after deployment and outstanding disposable-account lifecycle/device acceptance. No live account deletion was submitted for this repair.

### #176 — Task session recovery
- Implemented: a known antiforgery rejection gives plain feedback, focuses the error and offers a native Reload calendar navigation so session initialization runs again before an explicit retry. Stale write controls are withheld; completion/checklist/deletion are not replayed. Regression coverage verifies unchanged state, no requests/celebration and accessible recovery for all four action paths. Final-delete focus is separately in PR #288.
- Still required: owner retained-session reproduction after deployment; the original token/session cause is not established. Antiforgery validation is unchanged. Remaining phone/screen-reader acceptance stays open.

### #172 — Focus after successful deletion
- Implemented: successful calendar detail actions focus the stable Calendar heading while the removed trigger/grid reload disappear. Closing details also falls back there if its opener has gone. Week/Month/List reminder-deletion regressions verify focus after the complete refresh and retain Seen/approval behavior. This shared path also covers task deletion (#176).
- Still required: owner live deletion keyboard retest after deployment and outstanding mobile/screen-reader/Seen/privacy acceptance; #176 session recovery remains separate.

### #177 — Task conflict reload focus
- Implemented: loading the latest task after a version conflict focuses Title after the conflict controls disappear, alongside the existing announcement. Regression verifies current content/checklist/version, focus, and no automatic overwrite/resubmit.
- Still required: owner stale-tab keyboard retest after deployment and remaining phone/theme/actual-screen-reader acceptance.

### #250 — Month occurrence accessible dates
- Implemented: every Month bar names its full occurrence date (or full start/end range with years), including single-day repeats and continuations. Layout and rendered-DOM regressions distinguish November 7/14 and preserve pending status; year-boundary coverage names both years.
- Still required: owner phone and actual screen-reader retest after deployment; rendered names are not a real screen-reader certification.


### #278 — Mobile release-test foundation (acceptance blocked)
- Prepared: desktop plus touch Chromium/WebKit 320/390 profiles, reuse of existing M3 journeys without width-overriding loops, new theme/reduced-motion/date/reminder/toast/text-reflow/pending-overflow scenarios, exact-SHA/profile reporting and fail-closed coverage checks.
- Verified locally: typecheck, discovery and six report-policy tests including controlled absent/failed/skipped profile negatives.
- Still required: actual green targeted/full browser runs and a detectable browser regression, Edit/Swap and clearing/DST matrix completion, calibrated geometry/text behavior, then review/rollout under the existing release-only gate. Local Docker is absent and Playwright browser download produced invalid archives. No mobile product acceptance or real-device claim.

### #66 — Production artifact security evidence
- Implemented: production Deploy verifies immutable image provenance/source-tree equivalence and latest exact-candidate main Sonar analysis plus Release security gate before Azure access. Hotfixes and manual released-version redeploys use the same fail-closed checks; development stays independent. Added synthetic guard regressions and agent release instructions.
- Still required: reviewed rollout through normal releases, live main required-check/no-bypass ruleset evidence, exact-candidate Sonar/API and GHCR evidence for normal/hotfix/manual redeploy paths, and owner environment approval verification. No settings, production deployment or Sonar findings were changed; #65 is not accepted as resolved by these tests.

### #160 — Development Application Insights verification (not passed)
- Inspected active revision/image, telemetry variable names, Application Insights and linked workspace usage/cap/retention. Sent three anonymous synthetic GETs (200/200/401) with trace IDs. Detailed sanitized evidence is in `docs/runbooks/application-insights-verification-2026-10-25.md`.
- No exporter/configuration was found at the deployed commit; Application Insights showed zero seven-day requests while the workspace had container logs. Correlated API/dependency/failure ingestion and privacy were not established. Logs UI failed to render for direct verification.
- Current 0.06 GB rolling ingestion, $0.17 estimate, trial-credit $0 display and 0.5 GB/day cap do not establish zero incremental charges or shared billing-account headroom. Cost verification remains pending; no Azure settings, paid features or deployment changed. Missing instrumentation belongs to a separately approved slice of #86, followed by correlated and settled-billing verification.


### #279 — Visible text in accessible control names and rendered acceptance
- Repaired the three label-content-name mismatches detected by rendered scans: account name, pending Month “Proposed” status, and the Material picker period button. The picker wrapper retains Material's header, styles, navigation, live description and focus, and adds its current visible period after rendering.
- Added focused account/Month/header-navigation regressions. Preserve the visible word boundary between Month status and title. Picker keyboard tests use Material's roving active-date navigation instead of focusing an untabbable date cell.
- Prepared whole-page axe scans with contrast enabled and no exclusions across both themes and existing desktop/touch profiles, plus keyboard/date reason/focus/deletion assertions and sanitized exact-SHA state attachments. Full release summaries reject missing, stale, empty or violating scans; existing component tests and release-only browser policy remain.
- Verified locally: TypeScript typecheck, discovery (179 profile executions), seven report-policy tests, and Chromium controlled unlabeled-input failure followed by passing restoration. On application base `5269d52`, desktop execution reached all 54 scan states across both themes; keyboard/detail/date/deletion assertions passed, but all four journeys exposed the real label-content-name mismatches. Targeted desktop light-theme scan/focus journeys and the controlled scanner scenario then passed (3/3) against the repaired image. No full profile/theme or application-wide pass claimed.
- The earlier serial frontend run passed 573/573; a later run had one 5-second timeout and 572 passes. A focused retest and full profile/theme matrix remain outstanding. Error/toast in-place focus, remaining continued/repeated Month behavioral checks, real screen-reader evidence in #281, and manual review of axe incomplete results are also outstanding.
- Still required: validate picker view transitions and the wrapper's dependency on Material's period-button selector on dependency upgrades, then obtain owner acceptance after promotion. No scan exclusion or waiver.

- Follow-up #279: the repaired accessibility matrix passes 25/25 executions and all 270 required scans on candidate `bf0aa3f`, after the fast-selection close fix, 24px overflow minimum and deterministic whole-document scroll protocol. [Exact evidence and limits](docs/runbooks/calendar-accessibility-evidence-2026-10-25.md) retain the prior 13/12 failure result, 343 incomplete rule results and full-release/manual/screen-reader gaps. Final-head CI remains separate; later mock cleanup and absent-animation-API guard are not relabelled as the browser-tested SHA.

### #281 — Real screen-reader environment prerequisite
- Windows NVDA is installed; Guidepup starts/connects/stops, but the synthetic control announcement is absent in this agent session. macOS/VoiceOver is unavailable. Both acceptance paths remain blocked, not passed.
- See [prerequisite report](docs/runbooks/screen-reader-prerequisites.md) for actual versions, failed control evidence, controlled runner requirements, coverage map and residual mobile checks. No application transcript, CI runner or system permission change is claimed.

### #278/#279 — Coverage follow-up (October 26, 2026)
- Verified historical release PR #315 browser run 40316038202: 179 passing executions on merge candidate `92be9b9e962751f6e6fa3c273d6cb62836eae46e`; original no-run blocker notes above are historical.
- Added touch Edit/Swap invalid/corrected/cancel checks, Home/Calendar slot moving/clearing, Chicago spring/fall persisted edit boundaries and controlled overflow detection/restoration. Removed the remaining #259 viewport override.
- Added rendered save-error/retry/toast and repeated Month occurrence date/focus coverage. Required accessibility scan states now include these paths; report policy rejects mobile scans recorded at desktop width.
- [ ] Execute these new scenarios against their exact release merge candidate in all five profiles; the older green run does not verify new code.
- [ ] Complete remaining manual/incomplete axe review, ambiguous/nonexistent-time acceptance; retain real screen-reader/physical-device limits. No issue closure, merge or deployment.
- Added past/today stale-link recovery, repeated December/January occurrence names and both continued Month segments; these additions also await actual browser execution.

- [ ] **Event illustration themes #74:** all eleven motif directions approved, including the nine-theme light/dark board; default-On device-local per-account toggle, deterministic title matching and reusable artwork integration implemented in candidate; rendered visual/accessibility review and cross-device preference synchronization remain. 638 frontend tests, lint and production build pass. Follow-on implementation assigned to ChatGPT. See `docs/design/handoffs/EVENT_THEMES_74.md`.

## Earlier Playwright feedback (#341)
- [ ] Owner: require **Release E2E gate** on `release/*` and retain up-to-date checks and the existing develop gate.
- [ ] Verify the updated workflow on a work PR into the active release: controlled browser failure produces a red gate, then restored full desktop/mobile matrix passes; retain run links in #341.
