Warning: truncated output (original token count: 30564)
Total output lines: 1215

# Parenthesis TODO

The single list of work the owner has called a to-do, and of work left unfinished. **Rule:** whenever the owner says
something is a to-do, or work is left incomplete or deferred, it's added here, in the same change. Tick items off
(`[x]`) in the PR that finishes them, and add the date. In code, mark the exact spot with a `TODO(<area>):` comment
that points back here.

## Big projects
- [ ] **Angular source layout (#567).** Review the Dashboard pilot and [source move map](docs/adr/0009-frontend-source-layout.md).
  Continue in feature slices, starting with the shared date and Calendar boundaries. Move app-wide layout, core
  and shared code, and separate the global Sass layers. Verify lazy routes, assets and release Playwright coverage
  before closing the migration.
  - [x] Dashboard pilot (#569).
  - [x] Shells and navigation moved to `app/core/layout`; the Messages dock is wired in by `app/parent-app.ts`, so
    core imports no feature (`chore/567-core-layout`, November 12, 2026).
  - [ ] Separate the global Sass into `styles/abstracts`, `base` and `themes`, with a compiled CSS comparison.
  - [ ] Move the shared date types and helpers out of Dashboard (`dashboard/week.ts`, `model.ts`) before Calendar.
  - [ ] Remaining feature slices, then `shared/` into `components`, `directives` and `pipes`, and `core` services
    by responsibility. Each in its own PR.
  - [ ] Release Playwright run and a Development smoke test (sign-in, parent and kid shells, Home, Calendar,
    Settings, Messages dock) after each slice deploys.
- [ ] **English and Spanish localization (#534).** Review remaining runtime copy, including API validation and
  stored approval summaries, Family Memories export and quota messages, Child Essentials update announcements,
  and the privacy notice storage table. Use structured codes or fields where an API response mixes app copy and
  family-entered text. Walk the parent routes on Development in both languages at phone and desktop widths,
  including both themes, shared-device sign-in, and recipient-language email delivery.
- [ ] **From Your Kids (#531).** Verify the integrated release candidate in both themes and with a real screen reader.
  The owner approved the rendered artwork and photos preview on November 8, 2026. Connect parent-authorized
  content and actions once the M5 service is available.
- [ ] Verify the Family Memories artwork and cards on Development at phone and desktop widths in both themes (#520).
- [ ] Verify the Home greeting icons on the development site on phone and desktop in both themes (#523).
- [ ] Verify the desktop sidebar fits without an inner scrollbar on Development at laptop sizes, and all links remain reachable in short windows (#514).
- [ ] Verify viewer-authorized Home Upcoming avatars and initials fallback on the development site at phone and desktop widths (#529).
- [ ] Verify Home Upcoming row destinations and keyboard focus on the development site (#517).
- [ ] **Unified Notifications (#178, M4).** First slice: parent inbox, real unseen dot, seen-item expiry and notices
  for directly confirmed calendar event changes. Finish approval-gated and series changes, authorized Family Memories
  and Shared Records producers, live arrival updates, and responsive visual/accessibility acceptance.
  Child diary/artwork producers depend on M5 (#131).
- [ ] **Shared Records transaction PDF (#497, design #566).** Decide how verified full names are captured and
  retained at submission without retroactively substituting a current display name. Existing entries and original
  requests have membership IDs only and report their historical names as unavailable. Review retention, export wording,
  and privacy, then run Development acceptance for parent-only downloads, empty and invalid ranges, paging and print.
- [ ] **Shared records (#477, M4).** Shared Fund proposals and agreement, contribution reports with required
  attachments, acknowledgment and mismatch history, the progress thermometer, one-time Child Support records, and the
  navigation link with a waiting-on-you dot are built (November 7, 2026; decisions in
  `docs/design/shared-records-issue-477.md`).
  - [ ] Create the `shared-records` storage container, its role and `SharedRecords__BlobServiceUri` on development and
    production (`docs/runbooks/azure-environments.md`); until then reports answer "Attachments can't be saved yet."
  - [ ] Verify the approved paper-and-ribbon header on Development in both themes and with enlarged text.
  - [ ] Proposal revisions before agreement (today the other parent requests changes and a new proposal is sent).
  - [ ] In-app notices on submission and when acknowledged entries reach a target, once the notifications feed (#178)
    exists; the navigation dot stands in until then.
  - [ ] Verify pending indicators on a phone and desktop in both themes with a slow submission and
    attachment error, including reduced motion (#496).
  - [ ] Owner review of the Child Support wording for the U.S., Canada and Mexico, and of attachment retention.
  - [ ] Verify on the development site in both themes on a phone and a desktop, including screen reader use and a
    shared-device switch from a parent to a child.
- [ ] **Child Essentials (#126, M4).** Complete section editing and protected history, concurrent edit handling,
  and in-page update indicators.
  - [ ] Verify shared and household Routines in both themes, including protected history, revision acceptance, and stop sharing. Coordinate household update indicators with #128.
  - [x] Verify the allergy PDF renderer with one child, multiple children, empty allergy states and long notes.
    Correct fractional-height pagination; keep API scope and page-count regression checks in CI.
  - [x] Routines draft-preservation and allergy PDF regression checks passed in CI (#465).
  - [ ] Verify adding an emergency contact to all children on desktop and mobile, including partial saves,
    retry and preserving each child’s Call first selection (#499).
  - [x] #128 in-page update flow for School, Allergies & Food, Clothing & Shoes and What Helps: navigation dot,
    first-visit banners, child and section dots, row highlights (November 7, 2026).
  - [x] #128 update notices for Routines (shared rows, and a dot on the co-parent's tab until opened), Emergency
    Contacts and Shared Caregivers (November 7, 2026). Ratings, accepting a routine and stopping sharing make none.
  - [ ] Extend #128 update notices to Medication (values stay in the protected record) when it ships.
  - [x] Put update dots on the section tiles and clear them on open. Keep row highlights tied to visibility and household routine notices tied to the co-parent tab.
  - [x] Match the approved mockups (November 7, 2026): illustrated section tiles with what each holds, two columns on
    wide screens, one section at a time on phones with a way back, value rows in a card, Edit and History pills,
    segmented Routines tabs, caregiver and contact cards with Call buttons, banner icons.
  - [ ] Replace the section illustrations cut from the mockup (`src/frontend/public/art/child-essentials/`) with the
    original illustration exports (about 400px wide, transparent) when the owner has them.
  - [ ] Verify the Clothing & Shoes, What Helps, School, Allergies & Food, Routines, Caregivers and Emergency Contacts
    screens on the development site in both themes, on a phone and a desktop. Include the illustrated section
    headers, return focus, and caregiver card actions at 320px and with enlarged text (#510).
  - [ ] On dev, verify each section replaces the overview in the desktop main area while the sidebar stays visible,
    and that Back restores focus to the same child’s tile on mobile and desktop (#527).
  - [ ] Still missing from the mockups: the Medication tile (#127), the Download PDF bottom sheet with the child
    picker.
  - [ ] Verify caregiver phone formatting and stars beside names on desktop and mobile in both themes,
    including screen-reader rating announcements (#502, #503).
- [ ] **Shared Caregivers (#130, M4).** Verify caregiver details, duplicate-number confirmation, and independent ratings on mobile and desktop in both themes.
  - [ ] Verify adding to all children (#500), including partial saves, retries and separate ratings.
- [ ] **Privacy audit and Privacy Notice (#416, M3, October 31, 2026).** Inventory and findings in
  `docs/privacy/`; public notice at `/privacy`, linked from the sign-in-area footer, parent Settings and kids'
  Settings. Owner decisions: operator Eric Saldivar (individual), US families only, contact
  `privacy@parenthesisfamily.com`. No consent banner: all storage is essential or a user's own choice, and
  `storage-inventory.spec.ts` flags new storage.
  - [x] Inventory, findings, notice, links and tests (PR into `release/0.3.0`, October 31, 2026).
  - [ ] **Owner:** create `privacy@parenthesisfamily.com` (or a forward to you) before production.
  - [ ] Owner to check the notice on the development site, signed out and signed in, on a phone and desktop.
  - [ ] Decide a retention period for audit records (kept indefinitely today).
  - [ ] Before a significant notice change: a way to tell parents first (the notice promises this).
  - [ ] Before v0.5.0 child diary/artwork: revisit COPPA notice and consent, since children will add content.
  - [ ] Before families outside the US: GDPR/UK GDPR wording, lawful bases and regulator contact.
  - [ ] Later, if wanted: self-service data export (today a copy is sent on request within 30 days).
  - [ ] Before public launch: a lawyer's review of the notice.
  - [x] **Owner:** decided D1 to D11 in `docs/privacy/medication-preflight-127.md` (November 12, 2026); the approved
    flow is in the data inventory and the notice's new Health information section.
  - [x] Allergies, medical providers and Child Essentials are in the data inventory and notice (preflight D11).
  - [ ] **Before medication reaches production (#127, D2):** a lawyer reviews the preflight, the Health information
    section and the breach runbook (`docs/runbooks/breach-response.md`), including whether Washington's or
    Nevada's consumer health data laws require a separate consumer health data policy.
- [ ] **Switch Profiles showed the other parent after account switching (#405, M3, November 5, 2026).** Cause:
  the phone was still Parent A's shared device, and Parent B's sign-out went to that device's picker. Owner decision:
  B goes to sign-in and the device stays A's; the tab keeps showing sign-in until someone signs in again. Server
  rules unchanged (only A's PIN opens A's tile).
  - [x] Sign-out/Switch profile routing, regression tests for sequential parent sign-ins (PR into `release/0.3.0`,
    November 5, 2026).
  - [ ] Owner retest on the development site after the release promotion: A sets up a phone, signs out, B signs in
    with a password and signs out (lands on sign-in, no A tile, also after reload and Back), then A's PIN still works;
    repeat B to A.
  - [ ] Owner: which message showed when the PIN on the wrong tile was rejected (wrong PIN, try later, or "can't sign
    in on this device"), to close out the PIN observation.
- [ ] **Slow first calendar load (#415, M3, November 4, 2026).** Cause: cold starts after scaling to zero, not the
  calendar queries. Owner decisions: keep scaling to zero; cache calendar periods in memory only. Timings and how to
  measure: `docs/runbooks/calendar-load-timing.md`.
  - [x] ReadyToRun, single-platform image (867 MB to 290 MB), compressed app files, warm-up after listening,
    `Server-Timing`, parallel start-up calls, waking-up message, one quiet retry, in-memory cache (PR into
    `release/0.3.0`, November 4, 2026).
  - [ ] Owner to time the development site before and after the release promotion with
    `scripts/measure-cold-start.sh` and the browser steps in the runbook (the sandbox can't reach it), and record the
    numbers in the runbook.
  - [ ] Owner acceptance on development: the waking-up message after a quiet spell, moving between weeks, and that an
    edit or a co-parent's change shows after returning to the calendar.
- [ ] **Branded loading indicator (#413, M3, October 31, 2026).** Reusable approved icon animation is wired to
  calendar event/task/reminder saves and event/profile photo uploads; reduced motion and measured/unknown upload
  progress are supported. Retryable profile upload failures retain the explicitly unsaved preview.
  - [x] Follow-up fixes (November 4, 2026): event upload loading/results use one persistent status region;
    profile uploads retain the unsaved photo after rate limiting and clear old preview/success announcements
    before another operation. Regression tests cover connection, rate-limit and server failures.
  - [x] Browser emulation (November 4, 2026): 20 desktop/phone-width scenario combinations passed across runs,
    covering both themes and motion preferences, save/upload recovery and axe scans. One synthetic-family setup
    timeout passed on focused rerun. Evidence/limits: `docs/design/reviews/issue-413/README.md`.
  - [ ] Verify physical phone/desktop layout and spoken loading/completion/error announcements with
    NVDA/VoiceOver, including measured/unknown event upload progress. Browser emulation, axe and DOM assertions
    do not certify real devices or spoken screen-reader acceptance.
  - [ ] Complete owner acceptance on development after release promotion, including real upload persistence.
- [ ] **Event photos and Family Memories (#403, M3, October 31, 2026).** Owner approved the rules and the delivery
  plan (decisions comment on #403). Design: `docs/design/handoffs/EVENT_PHOTOS_403.md`, boards in
  `docs/design/reviews/issue-403/`. Google Photos export is #404, separate.
  - [x] Owner design review of the #403 boards: approved October 31, 2026, in the Claude app. The `design approved`
    label is the owner's to apply.
  - [x] Backend PR: Memories module, migrations, private blob storage, upload/read/delete endpoints, sharing and
    download settings, per-parent quota and event spots, expiry worker, uploads behind a feature flag. PR opened
    October 31, 2026 (branch `feat/403-event-photos-backend`); merged as #407 on October 31, 2026.
  - [ ] Owner to verify on the development site once release 0.3.0 is promoted to `develop`: upload, share, unshare,
    delete, download permission and Download all.
  - [ ] Owner Azure step: private `event-photos` container in each environment's storage account, Container App
    identity granted Storage Blob Data Contributor on it. Development done by the owner October 31, 2026 (uploads
    on); production still to do, with uploads off until the iPhone HEIC check. Owner to confirm in Cost analysis
    (Service name = Storage) that dev storage stays at $0 or cents.
  - [x] Frontend PR: event Photos section, upload, sharing, Family Memories page, Settings, dashboard card. Merged as
    #408 on October 31, 2026.
  - [x] ZIP download PR (streamed, nothing stored, each photo re-checked before it's written). Merged as #409 on
    October 31, 2026.
  - [ ] Release PR #410 SonarCloud gate (C reliability on new code). Fixed the `reduce()` without an initial value
    (#411, merged October 31, 2026). Two more reliability findings had been marked Accepted in SonarCloud: the
    hidden photo file input with no label (Web:InputWithoutLabelCheck) and a synchronous `Write` in the upload
    reader (S6966); fixed on branch `feat/sonar-410-reliability-2`. Tick when merged, the two Accepted findings
    show as Fixed and #410's Release security gate is green.
  - [ ] Physical iPhone check that Safari converts HEIC to JPEG in the picker before uploads are enabled on
    production (physical device checks are deferred to #112).
  - [ ] Owner to reconsider 14-day retention later; existing uploads keep their period.
- [ ] **Google Photos export (#404, M3, epic #61, November 4, 2026).** Owner chose one album per event and export of a
  whole memory or a single photo. Design: `docs/design/handoffs/GOOGLE_PHOTOS_EXPORT_404.md`, boards in
  `docs/design/reviews/issue-404/`, Google setup and verification tracker in `docs/runbooks/google-photos-export.md`.
  - [x] Owner design review of the #404 boards: approved November 4, 2026, in the Claude app, with both open
    questions as proposed (no re-export in M3; `appendonly` only). The `design approved` label is the owner's to
    apply.
  - [x] Owner Google Cloud steps (runbook section 1): Photos Library API enabled, `photoslibrary.appendonly` added
    (console shows it as sensitive), separate OAuth client `parenthesis-dev-photos` created, development site
    settings set (November 5, 2026).
  - [ ] Record the actual domain ownership, brand verification and publishing status in the runbook tracker.
  - [x] Backend PR: connection and OAuth, encrypted token, export queue and worker, status endpoints, feature flag,
    tests with a fake Google client; Privacy Notice and data inventory name Google Photos. Merged into
    `release/0.3.0` in #425 (November 5, 2026).
  - [ ] Confirm with real Google test accounts what the backend assumes from Google's docs and couldn't check against
    the fake: a full Google storage reports item status code 8 (RESOURCE_EXHAUSTED) in `batchCreate`, and a deleted
    album makes `batchCreate` answer 400/403/404 (the worker then makes a new album). Adjust the mapping if not.
  - [x] Running more than one copy of the app (development allows 2 replicas): one export pass at a time through a
    Postgres advisory lock, and the daily request count kept in the database (Copilot on release PR #428, fixed
    November 5, 2026).
  - [x] Owner decision (Copilot on release PR #428): if Google creates an album but the answer times out, the next try
    makes a second, empty album for that event. Accepted and documented in the design (November 5, 2026); revisit
    with a read scope for app-made albums only if the end-to-end test shows it happening.
  - [x] Frontend PR: Settings card, memory and photo export, status and error states. Merged into
    `release/0.3.0` in #426 (November 5, 2026).
  - [ ] End-to-end with two test Google accounts in Testing mode; then the demo video and Google submission.
  - [ ] Production only after Google approves the scope; keep the tracker's two readiness columns separate.
- [ ] **Faster PR checks (owner request, November 5, 2026).** Playwright is split across three machines in the
  `chore/faster-pr-checks` PR; the docs describe the rest ([Keeping PRs moving](docs/development-workflow.md#keeping-prs-moving)).
  - [ ] Owner, after that PR merges: turn off **Require branches to be up to date before merging** on the
    **release branches** ruleset (Settings → Rules → Rulesets → release branches → Require status checks to pass).
    Keep every required check. `develop` and `main` stay as they are.
  - [ ] Compare a few sharded runs with the single-machine time (about 13 minutes) and adjust the number of shards.
- [ ] **Dependabot PR #384 dependency validation (#398, October 30, 2026).** Conflicts against `release/0.3.0`
  resolved while retaining current PR issue-link safeguards, DataProtection, cryptography pins and SkiaSharp packages.
  Six dependency upgrades remain; SwaggerUI was already current.
  - [ ] Verify fresh candidate CI, backend build/format/tests and dependency compatibility before owner merge;
    conflict resolution alone is not acceptance or deployment.

- [ ] **Dependabot milestone routing (#394, October 30, 2026).** All five version-update entries target
  `release/0.4.0` (moved from `release/0.3.0` on November 7, 2026); trusted-default-branch automation routes same-repository bot PRs to the latest existing release
  matching an open milestone, with no main/develop fallback.
  - [ ] Promote through the normal release route to `main`; configuration and routing are inactive until then.
  - [ ] Verify live bot-token permissions, scheduled/manual routing, next-milestone rollover, conflicts/review
    handling and required checks against the retargeted candidate. No live routing or deployment claimed locally.
  - [ ] Update all static target-branch entries when cutting each release and promote the configuration normally;
    routing corrects PR bases in the interim, but cannot change which manifests Dependabot scanned.
  - [ ] Security updates still start on main under GitHub's platform behavior before routing; alerts stay enabled.

- [ ] **Dependabot Sonar findings (#394, #544).** Verify a fresh `develop` analysis closes
  `githubactions:S7631` on the tracking checkout and `jssecurity:S5145` on routing error output after promotion.
- [ ] **Dependabot tracking issues (#544).** After normal promotion to `main`, verify a real Dependabot PR gets
  one issue and passes the required tracking check. Rerun the writer to verify that it reuses the issue and link.

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
- [ ] **Independent parent and child profile photos (#388, owner decisions October 30, 2026).** Details and limits:
  `docs/design/handoffs/PROFILE_PHOTOS_388.md`.
  - [x] Each parent's own photo, each parent's private photo of each child, and each child's own photo, edited only in
    Settings; picker and PIN screens show each person's own photo; desktop calendar circles show photos, phones keep
    initials. Uploads validated, bounded, re-encoded without metadata and served only through authorized URLs.
    API, Vitest and Playwright (desktop and 320/390 touch Chromium, both themes) coverage.
  - [x] Owner design review of the Settings "Profile photos" section, the photo editor and the child's "Your picture"
    card: approved by the owner October 30, 2026. The `design approved` label is the owner's to apply.
  - [ ] Mobile WebKit Playwright profiles in CI, physical iPhone (HEIC photo conversion by Safari) and Android
    photo pickers, real screen reader pass of the editor.
  - [ ] Owner test on the dev site after the release reaches `develop`; #388 stays open until then.
  - [ ] Move profile photos from PostgreSQL to private Azure Blob storage before the private beta (v1.0.0): change
    the photo endpoints' storage and copy existing photos once. Owner decision October 30, 2026: Postgres for now.
- [ ] **Open an event's location in Google Maps (#113, owner-approved stretch, October 29, 2026).**
  - [x] Event details show **Open in Google Maps** under Where: a Google Maps directions link
    (`https://www.google.com/maps/dir/?api=1&destination=…`, no API key), percent-encoded, opening in a new tab with no
    referrer. No embedded map, Maps SDK, location permission or tracking. Blank, punctuation-only or over-long
    locations stay plain text. The API already hides locations people mustn't see, and request logs leave out bodies.
  - [x] The Location field's hint asks for "the street, city and ZIP" so directions find the right place (owner,
    October 29, 2026). The link itself sends the address to Google only when it's tapped; suggestions while typing
    came later in #354 (below), which sends typed text to Google through our API when that feature is on.
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
  - [x] Owner put the key in the dev Key Vault and app settings (`places-api-key`, `Places__ApiKey`,
    `Places__DailyLimit=300`; October 29, 2026, Succeeded).
  - [x] Owner set a $1 alert-only budget (all services; spend caps aren't available for Places), October 29, 2026.
  - [x] Owner: try suggestions on `develop` once #353 and #356 are released there. Confirmed working October 29,
    2026, after #360/#363 fixed the Pacific-day lookup in the chiseled image (release PR #362).
    ([runbook](docs/runbooks/google-places-suggestions.md), "Check it works").
- [ ] **Nearby places first in location suggestions (#414, owner decisions November 4, 2026).**
  - [x] "Use my location" toggle beside the Location field (Add and Edit), shown only when suggestions are on and the
    browser supports location. Position rounded to about 1 km on the server and sent to Google as a 50 km bias; never
    stored, logged, remembered between pages, or shown to the co-parent. Without it, suggestions are US only.
  - [x] Denied, unavailable and timed-out location each explain the fallback; typing and suggestions keep working.
  - [x] Integration tests (rounding, bias, US limit, bad coordinates ignored), Vitest and axe; Privacy Notice, data
    inventory and Places runbook updated.
  - [ ] Owner: on the dev site, search a chain with a nearby branch (e.g. "Texas Roadhouse" in Texas) with location
    on and check the nearby branch comes first; then block location and check the fallback message.
  - [x] Owner approved the suggestion list (October 29, 2026) with at most three suggestions and no embedded maps
    anywhere (`docs/design/reviews/issue-354/`).
  - [ ] Owner: before production, check the "Google Maps" text attribution against Google's current Places API (New)
    policies (owner decision: keep the text for the development site). Google suggestions are in the privacy notice
    (#416, October 31, 2026).
  - [ ] Production stays off until the owner decides; revisit the cap and cost with real usage.
- [ ] **Copy family events to parents' Google Calendars, one way (#386, owner decisions October 30, 2026).** Under
  Settings, not on the calendar; Parenthesis never reads Google. Scope `calendar.app.created` only; a "Parenthesis
  Family" secondary calendar per parent; refresh tokens encrypted with data protection, never logged
  ([runbook](docs/runbooks/google-calendar-sync.md)).
  - [x] API: connect (OAuth code flow with PKCE, state bound to the parent), disconnect (removes the calendar, revokes
    access), and a background copy of confirmed events every minute (creates, edits, cancellations; pending requests
    and pending changes never copied; the co-parent's unavailable time stays "Unavailable"). Stops and asks to
    reconnect when access is revoked or the calendar is deleted. Off without `GoogleCalendar__ClientId` and
    `GoogleCalendar__ClientSecret`. Integration tests with a fake Google.
  - [x] Settings → Google Calendar section and the `/settings/google-calendar` return page, with Vitest and axe.
  - [x] Each parent chooses which kinds of event to copy (owner decision October 30, 2026): a multi-select
    "Events to copy" list, everything but the co-parent's unavailable time ticked at first; unticked kinds leave Google.
  - [ ] **Owner:** Google Cloud setup in `parenthesis-dev` (runbook step 1): enable the Calendar API, consent screen
    with the one scope and test users, web OAuth client with the dev redirect URI.
  - [ ] **Owner:** client ID and secret in the dev Key Vault and app settings (runbook step 2), then "Check it works".
  - [x] Owner approved the "Events to copy" dropdown design as shown in the screenshots (October 30, 2026).
  - [ ] Before public launch: Google verification of the sensitive scope (privacy policy page, verified
    `parenthesisfamily.com`, demo video); runbook step 4. The privacy notice at `/privacy` covers Google Calendar and
    the Limited Use statement (#416, October 31, 2026).
  - [ ] Before production: encrypt the data-protection key ring with Key Vault (Platform hardening below), so the
    stored tokens are protected from a full database leak, not just a leak of their table.
  - [ ] Later, if wanted: tidy up a departing parent's Google calendar (today their token is deleted and the calendar
    stays in their Google account); child names in event descriptions.
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
  - [x] Run the actual release candidate with all profiles, verify the results and review failed traces. Release PR
    #362's gate (run 40868443190) passed 259/259 on candidate `9052a9b` in all five profiles.
  - [ ] Verify selected palette cards in light/dark browser views; real-device and screen-reader checks remain open.

- [ ] **PR #321 remaining review and Playwright recovery (#255, #261, #278, #279).** Selected Add cards use a
  distinct tinted fill; palette keys are typed with documented aliases; dashboard palette mapping replaces shadowed
  subcategory fills; historical unknown-parent fallback differs from Unavailable. Prior #322 raw child-link fix verified.
  - [x] Frontend lint, 605 tests and production build; E2E typecheck, 8 report-policy tests and 254 discovered executions.
  - [x] Run the exact release candidate in Chromium/WebKit after review (later candidates include it; #362's gate
    passed 259/259 in all five profiles). Time fields now use accessible labels;
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
      devices they registered, their unsent invitations, and the accepted invitation that held their ema…12564 tokens truncated…ing existing
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
- [x] Recent Messages: decided by removing the card from Home (owner decision, November 7, 2026). Family Memories
  takes its place beside From Your Kids; messages stay one tap away in the side menu, bottom bar and Quick Add.
  - [ ] Owner check of the new Home bottom row on the dev site after the next release/0.4.0 promotion.
- [ ] Replace placeholder counts (`src/frontend/src/app/core/layout/sample-counts.ts`) with real unread and notification
  data.
- [ ] Deferred (owner OK for now): photo avatars, kids' artwork and memory photos (initials and tiles are used).
- [ ] Show/hide password toggle (eye icon) on every password field: sign-in, create account, reset password and
  change password (owner request, October 20, 2026). A real button inside the field with an accessible name that
  says what it does ("Show password" / "Hide password", `aria-pressed`), reachable by keyboard, never submits the
  form, and the password goes back to hidden after submitting. Use the shared form components; check both themes and
  320px.

- [x] **Light-mode visibility (#209, October 30, 2026).** Category-tinted calendar item edges (at least 3:1 on the
  surface), a `--color-divider` hairline token for grid, hour and card lines, and a clearer selected state. Dark mode
  is visually unchanged. Before/after captures: `docs/design/reviews/issue-209/`.
  - [ ] Owner retest on development: phone and desktop in light mode, with the original "too bright, hard to see"
    complaint in mind. If light mode still feels too bright, the deferred option is dimming the ivory canvas and
    adding card hairlines (owner chose not to include it on October 30, 2026).

## Calendar follow-ups

- [ ] #547: verify the desktop Calendar legend in Week, Month and List on Development at 125% browser zoom with Messages minimized and expanded.
  November 12, 2026: failed at 1024×768 (the legend reserved the open Messages width and grew to about 258px tall); it now
  clears only the minimized bar and tightens below a 760px calendar (about 106px tall). Retest after it deploys.

- [x] **Reject explicitly blank event edit titles (#273; #98).** Single and recurring edits distinguish omitted
  titles from explicitly empty/whitespace titles. Required titles are rejected without saving other fields;
  omitted/null titles keep their values and Unavailable time retains its generic label and private notes.
  The Edit form requires parenting-time titles too. Regression tests cover validation, scope atomicity,
  omitted-title updates, privacy, accessible feedback and correction without losing input.
  - [ ] Run backend build/format/integration and frontend lint/test/build in PR CI; this workspace has no .NET SDK
    or Docker. After promotion, retest mobile/desktop, both themes and screen-reader behavior before acceptance.

- [ ] #554: verify the Unavailable details pattern and private-note visibility on Development from Home and Calendar, on desktop and phone in both themes.

- [x] **Reminder delete confirmation focus (#172).** Opening confirmation focuses Keep it with the deletion
  explanation; cancelling restores Delete reminder. The pending delete action keeps focus and blocks duplicate
  requests, including error/retry. Regression tests cover the observed BODY-focus failure and error-state axe.
  - [ ] After promotion, manually retest the confirmation, cancellation, failed and successful deletion by keyboard
    and screen reader on development, phone/desktop and both themes. Independent-parent checks remain open.

- [ ] #553: verify desktop Calendar Week attendee photos, initials and overflow with synthetic profiles on Development in both themes.
  The November 11 failure at 1024×768 (no avatars or overflow count) should be fixed by #582's narrow Week rules; retest
  at 1024 after #582 deploys.

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
- [x] **Name the clashing date in own-overlap refusals (#259 follow-up, November 5, 2026).** The API identifies the
  first conflicting occurrence's start in the family's named time zone, including on approval revalidation under
  the existing parent lock. Add/Edit/Swap retain the server message. Private unavailable-time details remain
  excluded, and the API no longer suggests choosing another caregiver. Backend recurrence/DST/privacy/rollback
  and frontend message-preservation regressions pass.
  - [ ] After merge/promotion, retest the dated conflict feedback on Development before closing #259.

- [ ] #549: verify parent navigation order, routes, active states and badges on Development in English and Spanish.

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

- [ ] #555: verify task and reminder child selection, recurrence, and filters on Development with three synthetic children on phone and desktop.

### #177 — Task conflict reload focus
- Implemented: loading the latest task after a version conflict focuses Title after the conflict controls disappear, alongside the existing announcement. Regression verifies current content/checklist/version, focus, and no automatic overwrite/resubmit.
- Still required: owner stale-tab keyboard retest after deployment and remaining phone/theme/actual-screen-reader acceptance.

- [ ] #551: verify the embedded Home Month, cross-month week selection, child filters and phone fallback on Development.

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

### #86 — Application Insights monitoring and alerts (code done, not live)
API telemetry and `infra/monitoring/main.bicep` (two availability tests, frontend/database/error-rate alerts, email
action group) are in the PR into `release/0.3.0` (November 5, 2026). Nothing was deployed or changed in Azure. Steps
and checks: `docs/runbooks/application-insights-monitoring.md`.
- [ ] **Owner decision:** change the $0/month monitoring rule (uptime runbook, October 28, 2026) or keep alerts on
  UptimeRobot only. Check current Azure Monitor prices first; the runbook's estimate (about $3.50/month per
  environment, plus extra compute from keeping the app awake) comes from third-party price copies.
- [ ] **Owner:** after release to development, add the `appinsights` secret reference and the
  `APPLICATIONINSIGHTS_CONNECTION_STRING` setting to `ca-parenthesis-dev` (runbook step 1).
- [ ] Live check: a request's `trace-id` shows up in `requests` with its PostgreSQL dependency, and a `?probe=` query
  string is absent.
- [ ] Live check: ingestion stays under the 0.5 GB/day cap over a week.
- [ ] **Owner, if approved:** deploy `infra/monitoring/main.bicep` to development (`what-if` first, runbook step 2).
- [ ] Live check: action-group test email arrives; frontend, database and error-rate alerts each send an alert and a
  "Resolved" email (runbook verification table).
- [ ] Production: the same steps with `ENV=prod` before or with the first production deployment.
- [ ] Bicep has only been built and linted in CI; it has never been run against Azure (`what-if` is the first test).
- [ ] Before telemetry is on in production: add Application Insights to the public Privacy Notice (what is sent,
  Microsoft as provider, retention). Raised in the release PR #445 review.

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
- [ ] #364 full website PR check: validate all five tests on the hosted Windows merge candidate using private
  PostgreSQL 17.11/Mailpit and loopback HTTPS. Verify `NVDA accessibility gate` reports the actual result and
  retain full speech/source/version evidence. Owner configures and verifies the required check on `release/*`;
  [runbook](docs/runbooks/nvda-website-ci.md). No protection change or hosted full-suite pass is implied by code.
- [ ] #364: Validate the separate optional `NVDA runner probe` on GitHub-hosted Windows using the
  existing smoke test. Record setup/tool versions, actual speech artifacts, repeated passes and a
  controlled-negative/restored pass before building full-app CI or proposing a required check.
  Existing release gates and branch protections remain unchanged; local NVDA results are not CI evidence.
- [x] Frontend timeout follow-up: cap Angular/Vitest workers at two (one on hosts with at most two
  available cores), preserving the default five-second deadline, isolation and every test/axe assertion.
  On this 12-core Windows host, the unchanged runner passed 678/678 once but timed out in a different
  test on repeat (677/678), consistent with worker contention rather than five deterministic defects.
  With the cap, two full runs passed 678/678 across 49 files (39.16s and 46.38s); frontend lint passed.
- Owner Windows run on `86f6f87`: navigation and event-dialog NVDA journeys passed (2/4 app tests).
  Activity save speech was captured but the assertion incorrectly required a quote; forms stopped on an
  incorrect aria-invalid assumption for an empty required Material input.
- Owner Windows rerun on `9b736e1` (October 29, 2026, 6:38 AM Central): corrected calendar-save and forms
  journeys passed, 2/2 in 4.0 minutes, including the saved-event check. All four app journeys now have passing
  NVDA results across two runs; this is not a single full-suite run on one revision.
- [x] Owner reported all five Guidepup tests passed together on Windows/NVDA on October 29, 2026,
  after restoring the assertion (checkout `387a415`; local last-run status also passed). Covers the smoke,
  navigation, forms, calendar saving and event dialog. This is owner-run evidence, not an agent NVDA execution.
- [x] Controlled negative on the same test code: substituted the expected Notifications speech with
  `NEGATIVE CONTROL LABEL MUST BE ABSENT`; the speech assertion failed with the actual captured
  `Notifications, menu button, collapsed, sub Menu`. Original file restored automatically; full suite then passed.
- [ ] Archive sanitized full-run and negative-control attachments with OS/browser/NVDA/Guidepup versions;
  repeat for stability. macOS VoiceOver, mobile readers and wider Calendar/approval coverage remain unverified.
  Required release gate unchanged; no merge, deployment or cross-platform acceptance is implied.
- Historical agent-session speech-capture failure is superseded by the owner's passing Windows smoke and app runs
  above. macOS/VoiceOver remains unavailable; evidence archival and repeated stability runs remain open.
- See [prerequisite report](docs/runbooks/screen-reader-prerequisites.md) for actual versions, failed control evidence, controlled runner requirements, coverage map and residual mobile checks. No application transcript, CI runner or system permission change is claimed.

### #278/#279 — Coverage follow-up (October 26, 2026)
- Verified historical release PR #315 browser run 40316038202: 179 passing executions on merge candidate `92be9b9e962751f6e6fa3c273d6cb62836eae46e`; original no-run blocker notes above are historical.
- Added touch Edit/Swap invalid/corrected/cancel checks, Home/Calendar slot moving/clearing, Chicago spring/fall persisted edit boundaries and controlled overflow detection/restoration. Removed the remaining #259 viewport override.
- Added rendered save-error/retry/toast and repeated Month occurrence date/focus coverage. Required accessibility scan states now include these paths; report policy rejects mobile scans recorded at desktop width.
- [x] Execute these new scenarios against their exact release merge candidate in all five profiles; the older green run does not verify new code. Done: #362's gate run 40868443190, 259/259 on `9052a9b` (desktop 71; each mobile profile 47, including 9 recovery and 4 acceptance scenarios).
- [x] Ambiguous/nonexistent-time browser coverage (#278, October 29): typed Chicago fall-back 1:30 AM saves the first occurrence and spring-forward 2:30 AM saves 3:30 AM, on every profile.
- [ ] Complete remaining manual/incomplete axe review (#279); retain real screen-reader/physical-device limits. No issue closure, merge or deployment.
- [x] Controlled product negatives (#278, October 29, local Chromium 320/390): a 600px toast and a nonexistent time moved to 1:30 AM failed exactly the 6 expected executions; restored code passed 171/171 locally (desktop and both Chromium phone widths). WebKit couldn't be downloaded in the agent sandbox; the CI-level red-gate check stays under #341 below. See the runbook.
- Added past/today stale-link recovery, repeated December/January occurrence names and both continued Month segments; these additions also await actual browser execution.

### #279 — Approvals states and published violations (October 29, 2026)
- Added the required `approvals-decline` scan state (open decline form, cancelled without deciding, verified by API),
  Approvals pending/declined labels, and Week/List assertions that pending/declined proposals are never named Confirmed.
- Release summary now lists each violation's rule ID, state, profile, SHA and sanitized selectors, including failed
  executions; any violation blocks. New report-policy test added. Runbook (`docs/runbooks/`) was out of scope for
  this run, so `tests/e2e/README.md` records the additions.
- [x] Run `npm run typecheck` and `node --test scripts/summary-policy.test.mjs` in `tests/e2e/` (October 29, after
  merging `release/0.3.0`): typecheck clean, report policy 9/9.
- [x] Local browser run (October 29): `accessibility.spec.ts` 33/33 on `chromium`, `mobile-chromium-320` and
  `mobile-chromium-390`; `approvals` and `approvals-decline` scanned in both themes on each, with 0 violations.
- [ ] Execute the new states in all five profiles and both themes on the exact release candidate (WebKit runs in CI only;
  the agent sandbox can't download it).
- [ ] Copy the README additions into the runbook's rendered-accessibility section and coverage map.
- [x] **Approvals focus loss fixed (#369)** (October 29): keyboard Cancel on the Decline form dropped focus to `<body>`, and
  Approve/Decline/Withdraw removed the focused button. Cancel now returns focus to that item's Decline button; a
  decision moves focus to the Waiting heading (the toast still never takes focus). Unit tests (4, failing on the old
  code) and a release-gate assertion after Cancel; accessibility spec 33/33 locally on Chromium desktop/320/390.

- [ ] **Event illustration themes #74:** all eleven motif directions approved, including the nine-theme light/dark board; default-On device-local per-account toggle, deterministic title matching and reusable artwork integration implemented in candidate; rendered visual/accessibility review and cross-device preference synchronization remain. 638 frontend tests, lint and production build pass. Follow-on implementation assigned to ChatGPT. See `docs/design/handoffs/EVENT_THEMES_74.md`.

- [ ] **Calendar header polish (#372, October 29).** Material buttons with an icon centre it with the label (Add,
  Request swap, Add item); the Switch profile pill left the top bar (account menu and Settings → Devices keep it);
  both bottom navigations sit above page content (z-index 10), so Month bars scroll under them. The new
  `calendar-header.spec.ts` failed on the old build ("+" 4.5px off "Add"; a tap on the navigation hit the Month bar)
  and passes 12/12; full suite 183/183 locally on Chromium desktop/320/390; 703 unit tests.
  - [x] WebKit profiles in the release gate (#374's gate passed in all five profiles).
  - [ ] Owner: check the Calendar header and Month view on the iPhone and desktop in both themes.
- [ ] **Popups clear the bottom navigation (#327, October 29).** Shared rule for every CDK connected popup: the
  navigation (safe-area inset included) is the screen's bottom edge, positions aren't locked so popups flip upward
  after resize/rotation, and the transparent backdrop stops at the navigation so one tap closes the popup and
  navigates. Modal dialogs unchanged. Guidance in `docs/design-system.md`. Unit tests 4/4; new
  `popups-clear-navigation.spec.ts` failed on the old build (picker bottom 584px vs navigation top 544px; navigation
  tap swallowed) and passes 12/12; full suite 183/183 locally on Chromium desktop/320/390.
  - [x] WebKit profiles in the release gate (#371's gate passed in all five profiles).
  - [ ] Owner: on a real iPhone (safe-area inset, Safari bars), open a date picker low on Add activity: it sits above
    the navigation, every date is tappable, and one tap on the navigation navigates.

- [ ] **PR milestones from tracking issues (#140), report-only.** `pr-milestones.yml` reports the milestone a PR
  inherits, and warns on conflicting issues, a different PR milestone, or a milestone from another release; rollups
  are only summarised. It never blocks or writes. 19 script tests. See `docs/runbooks/pr-issue-links.md#pr-milestones-140`.
  - [ ] Owner: get the workflow onto `main` (normal release sequence), then check reports on real PRs and record runs in #140.
  - [ ] Owner decision later: automatic assignment (apply mode + write permissions), then optionally a required check.
  - [ ] actionlint couldn't be downloaded in the agent sandbox; CI's workflow checks cover the YAML.

- [ ] **PR risk report (#141), report-only.** Phase 1 inventory and gaps in `docs/runbooks/pr-risk-audit.md`;
  `pr-risk.yml` classifies changed files (never labels) into security-review, database-change (destructive flagged),
  breaking-change and high-risk. 14 script tests; probed on real history (#370/#374 none, #345 security/breaking/high).
  - [ ] Owner: once on `main`, check reports on representative PRs and record false positives and misses in #141.
  - [ ] Owner decisions later: write the four labels (needs pull-requests: write); phase 3 enforcement via ruleset.
  - [ ] Owner: set the **Copilot release review** ruleset back to Disabled (still Active after #362 merged).

- [ ] **Sonar analyses develop (#373, option A, owner decision October 29).** `sonar.yml` scans pushes to `develop`
  and PRs into it; PRs into and pushes to `main` reuse `develop`'s latest analysis only when the git trees are
  identical (otherwise the gate fails), and recheck it didn't change mid-run. Sonar Sunday reports `develop`.
  Production evidence rule unchanged. 43 gate tests (7 new), 80 with production-security.
  - [ ] Owner: confirm SonarQube Cloud's main branch now reads `develop` (Administration → Branches and Pull Requests).
  - [ ] Verify on real runs: the first push to `develop` scans; the next `develop` → `main` PR shows the reuse step.
  - [ ] Owner decision: a hotfix path (hotfix PRs straight into `main` are now blocked by the gate until the fix is on `develop`).
  - [ ] Relate fresh `develop` findings to #65, #56 and #294; don't close those just because a scan ran.

- [ ] **M4 messaging (#125), slice 1 backend.** Messaging module (one conversation per family, immutable messages,
  idempotent sends, forward-only read positions, typing) and the first SignalR hub, `/hubs/chat` (listen-only, parent
  membership and same-site checks). ADR-0008 is Proposed. 10 integration tests; full suite 410/410.
  - [x] Frontend slice 1: chat page, unread dot, "New messages" divider, Read receipt, typing, Not sent/Retry
    (Home's Recent Messages and Quick Add Message now open it too).
  - [x] Owner decision: dictation relies on the phone keyboard's own microphone (no in-app mic button, which would
    send audio to a browser speech service); the mockups' mic is replaced by Send.
  - [x] Verify the phone layouts on WebKit (CI's `mobile-webkit-*` profiles passed on PR #449).
  - [x] Owner decisions (2026-11-06): keep a deleted parent's messages for the co-parent; nav label stays
    **Messages**; ADR-0008 accepted.
  - [x] Slice 2 of `docs/design/m4-chat.md`: calendar event cards (search by title or date, draft preview, cards read
    with each parent's calendar rules, unavailable events) and the compact desktop chat (Minimize, Expand, Close).
  - [x] Owner decision: the compact chat opens from Minimize on the full Messages page; no separate launcher for now
    (revisit after trying it on develop).
  - [x] Slice 3 of `docs/design/m4-chat.md`: PDF transcripts (preview, Save, Download, saved list; ADR-0008
    decision 10).
  - [ ] #125/#548: Confirm the profile-name policy for parents whose existing profile name is a nickname, and
    review tagged PDF and screen-reader support. The account currently stores only the profile name.
  - [ ] #125/#548: Verify exact text extraction for multi-codepoint emoji. Noto Emoji renders these sequences in
    the PDF, but some extract as a base or private-use glyph. Extend font coverage for additional writing systems.
  - [ ] Verify on develop: the live connection works through Azure's ingress (WebSockets, same-site check).
    November 11, 2026: it failed because the app ran two replicas with no backplane (negotiate on one, connect on the
    other: `404 No Connection with that ID`). The deploy workflow now sets `--max-replicas 1`; after the next deploy,
    retest two-parent send/read, live read receipts and reconnect.
  - [ ] Add a SignalR backplane (for example Azure SignalR) before the app ever needs more than one replica.

## Earlier Playwright feedback (#341)
- [ ] Move the Playwright release gate to Ubuntu 26.04. `ubuntu-latest` switched on 2026-11-06, and there WebKit saved
  "Download all" ZIPs with underscores and axe reported colour contrast in the swap date picker. The gate is pinned to
  `ubuntu-24.04` until those are understood (real issue or WebKit difference) and fixed.
- [ ] Owner: require **Release E2E gate** on `release/*` and retain up-to-date checks and the existing develop gate.
- [ ] Verify the updated workflow on a work PR into the active release: controlled browser failure produces a red gate, then restored full desktop/mobile matrix passes; retain run links in #341.

- [ ] Verify Home Quick Add saves and cancellation from all four shortcuts on the development site (#515).

### #546 — Desktop Home greeting overlap
- [ ] After promotion, verify the greeting and calendar toolbar on Development with the original browser and 125% browser zoom.

### #552 — Seven-day mobile Calendar Week grid
- [ ] Retest on Development with physical iPhone Safari and Android Chrome in both themes, including touch scrolling, dense overlap, event details and bottom navigation.

## Child Essentials Spanish follow-up (#577)

- [ ] Complete CI build/full frontend and backend validation, including the new allergy PDF localization/tenant tests.
- [ ] Verify Spanish section layouts on phone/desktop in light/dark, keyboard/screen-reader labels, Development language persistence/reload, and rendered allergy PDFs. See `docs/testing/child-essentials-spanish-577.md` for the audited inventory and local evidence.

## Mobile calendar attendee photos (#581)

- [ ] Verify authorized parent/child photos in Home Week/List and Calendar Week/List on Development, both themes and phone widths, including missing/failed images and narrow-slot overflow. Automated regression coverage is included; physical-device verification is not yet executed.

## Safari favicon fallbacks (#579)

- [ ] After deploying the favicon fallback assets, verify the tab icon in Safari 16.6 on macOS 13, an SVG-capable browser, and Apple bookmarks/touch icons. Check image responses before clearing a stale favicon cache. Local exports and automated asset checks do not certify Safari acceptance.

## Remaining Spanish text (#534)

The November 12 test found English on Settings (profile photo hints, Google Photos export status), chat event cards
(dates, "All day", "Declined") and Memories (dates, "You", deletion chips). `fix/534-remaining-spanish` translates those
and the Memories photo helpers (deletion dates, upload refusals, file problems).
- [ ] Retest #534 on Development in Spanish after this deploys, including the "Shared Caregivers" heading from #578.
- [x] Sweep the remaining hard-coded English built in code (`fix/534-english-sweep`): privacy notice storage list
  and contents, Google Photos export lines and progress, Memories download/final-week/export notes, calendar Month bar
  labels, date-rule and title validation, unavailable-time conflicts, proposed-change dates, approvals, Home
  "unavailable" titles, kids gallery expiry, onboarding, delete-account, and the Add event repeat preview.
- [ ] Still English by design or for later: child-account screens (`features/kid/*`, out of #534's scope), the
  default "Time with {name}" parenting-time title (stored event data, seen by both parents), the development-only
  sample dashboard data, and server messages missing from `core/api/problem.ts`'s Spanish map.
- [ ] Check system emails in Spanish.

## Medication reference (#127)

- [x] Backend (revisions, one-time confirmation, permanent delete, PDF), Medical screen section, Privacy Notice and
  inventory, breach runbook (branch `feat/127-medication-reference`, November 12, 2026).
- [ ] CI: first run of `MedicationTests` and the child-session check in `ChildAccessTests` (Docker wasn't available
  locally, so these integration tests haven't run yet).
- [ ] After deploy, test on Development with synthetic data and two parents: first-save confirmation, add, edit,
  discontinue, resume, delete permanently (history and the other parent's banner show no details), concurrent edits,
  PDF for one child, all children and current only, in English and Spanish, phone and desktop, both themes,
  keyboard, screen reader and reduced motion. A kid tablet must never show medication.
- [ ] A Playwright spec for the Medical screen's medication flow.
- [ ] Lawyer review before production (see the Privacy audit item above).

## Shared Records submit indicator (#496)

- [ ] After deploy, retest on Development with writes delayed or blocked: Report contribution, Shared fund request and Child support record each show the branded indicator just above Submit, in view at 1280×800 and phone width, both themes, keyboard and reduced motion.
