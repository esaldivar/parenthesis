# Parenthesis: Claude Code handoff

Read [docs/design-system.md](docs/design-system.md) and the [brand handoff](docs/design/README.md) before designing or implementing UI. **Brand identity is locked.** The user approved the original branding board's **Variation 1 (Default)** icon and **Option B** wordmark. Read `docs/design/BRANDING.md`. Never regenerate, redesign, recolor, or approximate the logo. The root README currently displays a **provisional** SVG from `docs/design/assets/parenthesis-logo-concept.svg`; it is NOT the approved master. Do not promote it or use it as the visual reference. The exact source image is committed at `docs/design/assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg`; production exports must still be visually verified before replacement. Keep the README concise: show the logo and link the design guide rather than copying the full styling specification.
It records the Parenthesis visual direction and acceptance checks, not a request to
implement every feature at once.

## Read first and preserve

- Follow [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), applicable
  directory instructions, and the accepted [ADRs](docs/adr/).
- Read [solution architecture](docs/architecture/solution-architecture.md),
  [Milestone 1](docs/planning/milestone-1-plan.md), and the
  [backlog](docs/planning/mvp-backlog.md) for scope and sequencing.
- Existing documents use the working name Kinship and namespaces `CoParent.*`.
  Parenthesis is the product name for this design handoff. Do not rename projects,
  namespaces, database entities, or existing documents as part of UI work.
- Preserve existing work. Inspect the current branch and diff before editing;
  keep changes small and avoid unrelated rewrites or new UI frameworks.

## Repository reality

At this handoff, `src/backend/` contains the .NET 10 foundation and Identity/Family
module skeletons. The Angular workspace, tests, and CI are planned; their presence
in architecture diagrams does not mean they exist. Inspect the checkout first.
The agreed frontend is standalone Angular with lazy routes, signals, Angular
Material + CDK, shared components, and separate parent/kid shells. Integrate the
design through semantic theme tokens and accessible primitives.

## Product guardrails

- Parents have equal authority. Show proposals and their decisions clearly; a
  pending proposal must never look like an already confirmed calendar change.
- Preserve server-side tenant isolation and authorization. UI hiding is not an
  authorization boundary. Keep same-origin cookie auth and antiforgery handling.
- Respect ADR-0003 approvals and ADR-0005 immediate protective Restrict behavior.
  Restrict and permanent deletion are separate actions with separate explanations.
- Children must not see parental disputes or approvals. Diary entries are private
  by default; MVP sharing is with both parents or nobody, per the architecture.
- Use only synthetic family/child data in demos, fixtures, screenshots, and issues.
- Appearance is personal: one user's light/dark/system choice must not change
  another parent's or child's preference or require mutual approval.

## Open work

[TODO.md](TODO.md) is the single list of open work. Anything the owner calls a to-do, and anything left unfinished or
deferred, is added there in the same change and ticked off in the PR that completes it.

## Security and release checks

Follow [the release security gate](docs/runbooks/sonar-release-gate.md) and [SECURITY.md](SECURITY.md).

- Before opening or updating a release PR (`develop` → `main`, or `hotfix/…`), review SonarQube Cloud's findings for
  the release: the latest Sonar Sunday issue, open security issues and hotspots on `main`, and the PR's own analysis.
- Resolve every release-blocking finding before asking for the release to merge: fix it on a branch into `develop`,
  or, only with the owner's decision, mark it Accepted / False positive (hotspots: Safe / Acknowledged) in SonarQube
  Cloud **with a comment** giving the reason, who decided, and the linked GitHub issue or PR.
- Never bypass, skip, disable or weaken a security check to get a PR through: no editing the gate, its policy, the
  quality gate or the required checks to make a PR pass, no admin merges past a red check, no accepting a finding
  just to unblock a release. A policy change is its own reviewed PR. If a check is wrong, say so and stop.
- Record every accepted security exception in SonarQube Cloud (the comment) and in the tracking GitHub issue.
- Before requesting review, run the checks that apply to the change (backend build, format and tests; frontend lint,
  tests and build; `node --test` for `.github/scripts`; actionlint for workflows when available) and report what
  ran and what couldn't.

## Implementation and verification

Follow Milestone 1: scaffold the shell/theme first; use honest empty states for
unbuilt features. Do not imply working uploads, messaging, or approvals with fake
success interactions. Implement later features in their planned milestones.

For UI changes, check keyboard navigation, focus, screen-reader labels, contrast,
320px layouts, text enlargement, reduced motion, both themes, and independent
user preferences against the checklist in the design system. Run the build, lint,
and relevant tests actually available in that checkout; use Vitest when the Angular
workspace lands. Backend changes follow the repository's build/test/format rules.
Report checks performed and limitations accurately; do not claim absent tests or
CI passed. Documentation-only changes need link/diff review, not a frontend build.

## Prototype availability

No home-page HTML attachment was available through the retrieved App Design
Workflow conversation, and no HTML prototype was present in this checkout.
Do not invent a recovered prototype. If the original files become available,
preserve them as references under `docs/prototypes/` with provenance and describe
any differences from the design system before using them for implementation.

## Telegram notifications

Use the Telegram bot (`TELEGRAM_BOT_TOKEN`) only when the owner says in that
session that they are away from the app (for example, driving). Otherwise do not
use it.

- Message only when you are blocked and need the owner's response. No progress
  updates, summaries, or completion notices.
- Keep it to one short, general line, such as "I need your response on the PR
  review." Put the full question and details in the Claude app, not Telegram.
- The bot cannot receive replies; the owner answers in the Claude app.
- No chat ID is stored. Ask the owner to message the bot, then read it from
  `getUpdates`. Strip whitespace from the token before use.

## Development workflow: PR limits, Copilot reviews, Discord

[docs/development-workflow.md](docs/development-workflow.md) is the authoritative reference; follow it. In short:
- At most **3 new development PRs a week** and **6 Copilot reviews a week, 2 per PR** (initial plus one follow-up).
  Weeks start Monday 12:00 AM Central. Check usage before opening a PR or requesting a Copilot review.
- At the limit, keep working and committing on the branch; don't open the PR or request the review. Exceptions
  need the owner's `owner-approved-pr` / `owner-approved-review` label. Group related work; no PRs for minor changes.
- Never merge PRs automatically, and never open duplicate PRs to get around a limit.
- Before opening a **major** PR, send the owner a Discord summary (`dev-workflow.mjs send`); report it if it fails.
- Don't change branding, UI or application features as part of workflow work. **Do not merge PR #40**, and don't
  assume it's ready.

## Branching, release and environments (owner brief, October 18, 2026)

Status: **brief recorded, not implemented.** It conflicts with the process in [CONTRIBUTING.md](CONTRIBUTING.md) in
several places (see "Discrepancies" below). CONTRIBUTING.md stays in force until the owner approves a plan. Inspect
the repository, its settings and its infrastructure first, propose a plan, and **do not change branches, protections,
workflows, environments or documents until the owner approves it.** Once approved, document the result in
`docs/development-workflow.md` and shorten this section to a link.

### Goal
A milestone-based workflow with feature/bugfix branches, one release branch per milestone, a private
development/testing environment, a stable production environment, automated checks, scheduled production releases,
manual owner approval, Discord release notifications and controlled Copilot review use (see the section above).

### Branches
- **`main`: production.** Real families use it, so it must stay stable. No direct pushes, no unreviewed changes, no
  automatic production deployments. Required checks pass, deployments need owner approval, and rollback must be
  possible.
- **`development`: private testing environment.** Approved merges deploy automatically. Only authorized testers can
  reach it, with configuration and data separate from production. No direct pushes; required checks pass; it must stay
  working. It is **not** an open integration branch: only stabilized milestone releases and approved hotfix syncs
  enter it.
- **`release/x.y.z`: one per milestone** (`release/0.1.0`, `release/0.2.0`, …). Created from the latest approved
  `development`. Create only the active milestone's release branch, one at a time, never all future ones up front.
  All features and non-production bug fixes for that milestone target it.
- **`feature/<name>`** and **`bugfix/<name>`**: branch from the active release branch and PR back into it.
- **`hotfix/<name>`**: urgent production bugs only. Branch from `main`.

```text
main
 └─ development
     └─ release/0.2.0
         ├─ feature/parent-registration
         ├─ feature/child-profiles
         └─ bugfix/child-pin-validation
```

### Feature and bugfix workflow
1. Branch from the active release branch. 2. Implement. 3. Run the relevant tests. 4. Open a PR into the release
branch. 5. Required checks run. 6. Request a Copilot review within the weekly limits. 7. Resolve blocking issues.
8. Merge the approved PR into the release branch.
- Never merge incomplete features into `development` or `main`. Never merge a PR automatically without authorization.

### Hotfixes
Identify the production issue → branch from `main` → smallest safe fix → tests → protected PR → owner approval →
deploy → verify production → propagate into `development` → propagate into affected active release branches.
Emergency hotfixes may ship outside release windows, but still need approval.

### Milestones (working release structure)
| Version | Milestone | Scope |
|---|---|---|
| v0.1.0 | 1. Foundation | Architecture, project configuration, design system, foundational UI components, dashboard foundation, initial development infrastructure |
| v0.2.0 | 2. Accounts and profiles | Parent registration, authentication, family invitations, child profiles, child PIN access, profile picker, parent and child permissions |
| v0.3.0 | 3. Calendar and approvals | Shared calendar, parenting schedules, event proposals and approvals, schedule change requests, calendar notifications |
| v0.4.0 | 4. Communication (proposed) | Secure parent messaging, family communication, notifications, shared family information |
| v0.5.0 | 5. Child experience (proposed) | Child dashboard, artwork uploads, photo sharing, journal, child-specific privacy controls |
| v1.0.0 | Private beta | Integrated milestones, security validation, end-to-end testing, production readiness, invitation-only access |

Do not overwrite approved requirements in [the backlog](docs/planning/mvp-backlog.md), the milestone plans, issues or
project boards. Report discrepancies before proposing changes. Child privacy rules above (diary private by default,
children never see disputes or approvals) still apply to Milestone 5.

### Release schedule
- Production release windows are **every other Friday, America/Chicago**: October 30, November 13, November 27,
  December 11 and December 25, 2026, then every two weeks.
- They are opportunities, not deadlines. Never ship an incomplete or unstable release: skip the window, keep the
  release branch open, and target the next approved window. A milestone must be ready and approved before release.
- Flag holiday windows for the owner (November 27 is the day after Thanksgiving; December 25 is Christmas). Never
  reschedule or deploy on a holiday without approval.

### Two-week cycle (target, never a reason to skip testing or approval)
- **Week 1.** Mon–Wed: features, fixes, PR reviews, automated tests. Thu–Fri: finish scope, stabilize, integration
  tests, fix release blockers, draft release notes.
- **Week 2.** Mon: release PR into `development`, checks, approval, deploy to the private environment.
  Tue–Wed: test there (authentication and authorization, family workflows, database changes), fix critical defects,
  retest. Thu: readiness review (acceptance criteria, deployment plan, rollback), Discord release summary, request
  owner approval. Fri: promote to `main`, deploy the tested artifact, production smoke tests, health check, tag the
  release, Discord deployment confirmation.

### Promotion
1. **Release branch:** feature and bugfix PRs merged, required tests green, stabilization done.
2. **`release/x.y.z` → `development`:** passing checks, finished release notes, owner approval, no open blocking
   defects. Then deploy to the private environment, run smoke and integration tests, and record the tested commit and
   artifact. If validation fails, block production, fix the release and retest.
3. **`development` → `main`:** successful development testing, an approved release candidate, production readiness
   checks, owner approval and a verified rollback procedure. The PR must contain only the approved, tested release;
   if `development` holds anything else, stop and propose a safer promotion. Deploy the exact tested artifact where
   the host supports it; never rebuild different contents for production. After deployment: smoke tests, health
   check, version tag, release notes, Discord notification. Never deploy an unapproved release.

### Branch protection
Investigate GitHub rulesets and branch protection, and propose rules for `main`, `development` and `release/*`: no
direct pushes to permanent branches, required PRs and status checks, no force pushes, no unauthorized deletion, owner
approval for production promotion, and suitable limits on automation identities. Avoid rules that block legitimate
release work, and say which protections this repository's GitHub plan can actually enforce.

### Environments (none exist yet)
- **Development:** private test site deployed from `development`, restricted access, its own database and secrets,
  safe synthetic test data, automated smoke tests.
- **Production:** site deployed from approved `main` releases, its own database and secrets, appropriate monitoring.

### Discrepancies with the current repository (found October 18, 2026; resolve with the owner)
- The integration branch is **`develop`**, not `development`, and features branch from and PR into it directly. CI,
  the PR source check, Release Tuesday and protections all reference `develop`. Renaming it is the owner's call.
- There are no release branches yet; `main` only accepts PRs from `develop` or `hotfix/…`.
- Releases are **weekly (Release Tuesday)**, not biweekly Fridays.
- **No PR approvals are required** today: GitHub doesn't let authors approve their own PRs, and this is a
  single-maintainer project. Owner approval for deployments would need another mechanism, such as GitHub environment
  required reviewers.
- [The backlog's milestone map](docs/planning/mvp-backlog.md) differs: M1 includes auth and tenancy; M4 is
  memories, uploads, mutual deletion and restriction; M5 is dashboard, notifications, hardening and the Azure deploy
  (the MVP release); messaging and the child diary are M6+.
- SonarQube Cloud (Free plan) only analyses PRs into `main` and `main` itself.
- This brief ends at the production environment; anything planned after that point wasn't received.
