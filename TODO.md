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
  - [ ] **Weekly rhythm** (owner decision, October 17, 2026). Sonar Sunday issue → fix PR into `develop` → Release
    Tuesday. Both workflows are written; they start running once they're on `main` (the next release). Then check
    the first automatic Sonar Sunday issue.
  - [ ] **Owner:** in SonarCloud, mark the `tabindex` code smell on the calendar's scroll area as **Accepted**,
    with the reason "required so keyboard users can scroll the hours".
  - [ ] Add the quality-gate badge to the README.
  - [ ] **Owner, optional:** install SonarQube for IDE (formerly SonarLint), which is free, in connected mode.
- [ ] **Branching model and protected branches** (requested October 17, 2026).
  - [x] `develop` created from the latest work (`feat/angular-shell`, which is now retired).
  - [x] CI runs on pushes to `develop`. The **PR source** check only lets `develop` or `hotfix/…` merge into `main`.
    The model is documented in CONTRIBUTING.md.
  - [x] Branch protection on `main` and `develop`: PRs only, required checks up to date, no force pushes or deletions, admins included (October 17, 2026).
  - [x] The **PR source** check also covers PRs into `develop` and re-runs when a PR is retargeted, in
    `.github/workflows/pr-branch-policy.yml` (October 17, 2026).
  - [ ] Document the `design/…` and `feat/…` branch prefixes in CONTRIBUTING.md, and that **PR source** now checks
    PRs into `develop` too.
  - [ ] First release: PR `develop` → `main`, so `main` gets the dashboard work. This is the owner's call, since
    `main` is the site.

- [ ] **Deployment: development and production environments** (scoped October 17, 2026; to plan later).
  - Two environments:
    - **Development**, deployed automatically from `develop`: the newest features, **synthetic data only**.
    - **Production**, deployed from `main` on each release: the stable version, with real families.
  - Each environment gets its **own database**. Development must never hold real family or child data.
  - Platform: Azure, as the architecture already chose (Container Apps, Azure Database for PostgreSQL, Blob Storage,
    Key Vault). Confirm this with the owner, including AWS as the alternative, when planning.
  - Keep costs low: small tiers, and check what Azure's free offers cover.
  - **Real email sending** for deployed environments, for example Azure Communication Services Email. Mailpit only
    catches mail locally. Email is used for account confirmation, password resets and account-safety notices, and
    later for approval notifications.
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
  - [ ] Frontend: re-fetch the antiforgery token whenever the profile changes (kid signs in, parent signs back in).
  - [ ] Frontend: these screens, once Design Request #1 (issue #38) is approved.
    Approved October 18, 2026 (owner decisions: one parent tile per device, 7-day invitations with the email copy
    saying 7 days, one generic screen for expired/used/revoked links, 8-character pairing code typed in a text box,
    "We've let your parents know" for a locked PIN, initials and no age on child tiles). Delivered as small PRs into
    `develop`:
    - [x] Backend: a household device's picker shows only the parent who registered it, not both parents
      (October 18, 2026).
    - [ ] Sign-up, household setup and invitations.
    - [ ] Profile picker, parent password and child PIN screens.
    - [ ] Tablet pairing and device management.
    - [ ] Co-parent approvals.
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
  - [ ] Later, optional: a Claude agent that reacts to GitHub issues automatically. It needs a paid API key, so it's
    deferred for cost.
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
    data source.

- [ ] **Development workflow automation** (owner brief, October 18, 2026). Weekly PR and Copilot review limits,
  Discord notifications for major and release PRs, and a weekly status report. The brief is in CLAUDE.md.
  - [x] Brief recorded in CLAUDE.md (October 18, 2026).
  - [ ] Inspection report to the owner (CLAUDE.md step 11), then wait for approval.
  - [ ] After approval: implement, write `docs/development-workflow.md`, and shorten the CLAUDE.md section to a link.

- [ ] **Branching, release and environments** (owner brief, October 18, 2026). Milestone release branches, a private
  `development` environment, biweekly Friday production releases with owner approval. The brief is in CLAUDE.md.
  - [x] Brief recorded in CLAUDE.md, with the discrepancies against the current process (October 18, 2026).
  - [ ] **Owner:** decide the discrepancies (`develop` vs `development`, weekly vs biweekly releases, milestone map).
  - [ ] Plan for protections, environments, hosting and deployment approval; wait for owner approval.
  - [ ] Flag the November 27 and December 25, 2026 release windows (holidays) for the owner.
  - [ ] After approval: implement, update CONTRIBUTING.md and `docs/development-workflow.md`, and shorten the CLAUDE.md
    section to a link.

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

## Backend features the dashboard is waiting on
- [ ] Calendar and parenting-time endpoints, including change requests and approvals.
- [ ] Family events (both parents attend) and parent unavailability. These are UI-only mock categories today.
- [ ] Kid shares, messages, memories, and notification/unread APIs.

## Platform hardening (from the architecture backlog)
- [ ] F-09 transactional outbox.
- [ ] S-01 data-protection key ring.
- [ ] S-03 forwarded headers behind the proxy.
