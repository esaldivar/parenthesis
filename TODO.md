# Parenthesis TODO

The single list of work the owner has called a to-do, and of work left unfinished. **Rule:** whenever the owner says
something is a to-do, or work is left incomplete or deferred, it's added here, in the same change. Tick items off
(`[x]`) in the PR that finishes them, and add the date. In code, mark the exact spot with a `TODO(<area>):` comment
that points back here.

## Big projects
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
      runs `--scheduled` (headless; quiet when idle; skips issues that already have a queue branch or PR; waits at the
      weekly limit; Discord notice when a draft PR opens or a run fails, once per problem; clears a crashed run's
      lock). Set up with `scripts/claude_queue_schedule.ps1`.
    - [ ] **Owner:** after this merges, run `scripts/claude_queue_schedule.ps1` once (runbook, "Running it on a
      schedule"). The first scheduled run is the pilot: #98 runs headless once the weekly limit resets.
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
  - [ ] Backend: recurrence (C-05), reminders (C-04, with notifications), the .ics feed (C-07).
  - [ ] Frontend: the calendar page and the approvals inbox once Design Request #2 is approved; the dashboard's live
    data source. The inbox exists since v0.2.0 but shows only child requests; show calendar requests there too.

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
    - [ ] Invitations in the browser, and the v0.3.0 calendar screens.
  - [ ] If the suite outgrows the fixed child-PIN rate limit (30 a minute per address), make it configurable like
    the sign-in limit, for the test instance only.

- [ ] **Development workflow automation** (owner brief, October 18, 2026). Weekly PR and Copilot review limits,
  Discord notifications for major and release PRs, and a weekly status report. The brief is in CLAUDE.md.
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
  - [ ] First deployment to the development site (triggered by the next merge into `develop`); if the image pull
    fails, make the `parenthesis-api` package public and re-run.
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
