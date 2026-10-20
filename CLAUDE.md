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
- Resolve every release-blocking finding before asking for the release to merge: fix it on a branch into the active
  `release/x.y.z` branch (or a `hotfix/…` if it can't wait), or, only with the owner's decision, mark it Accepted /
  False positive (hotspots: Safe / Acknowledged) in SonarQube Cloud **with a comment** giving the reason, who
  decided, and the linked GitHub issue or PR.
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

- Every PR must list relevant real repository issues in **Tracking issues**, one plain-text `Refs #123` per line.
  Include releases, hotfixes and syncs; reuse the underlying issues (closed ones are allowed), never unrelated
  issues or PR-only references. Keep issue acceptance and deployment verification separate. Use `Refs` on
  intermediate branches; follow [the issue-link runbook](docs/runbooks/pr-issue-links.md).

[docs/development-workflow.md](docs/development-workflow.md) is the authoritative reference; follow it. In short:
- At most **3 new development PRs a week** and **6 Copilot reviews a week, 2 per PR** (initial plus one follow-up).
  Weeks start Monday 12:00 AM Central. Check usage before opening a PR or requesting a Copilot review.
- At the limit, keep working and committing on the branch; don't open the PR or request the review. Exceptions
  need the owner's `owner-approved-pr` / `owner-approved-review` label. Group related work; no PRs for minor changes.
- Never merge PRs automatically, and never open duplicate PRs to get around a limit.
- Before opening a **major** PR, send the owner a Discord summary (`dev-workflow.mjs send`); report it if it fails.
- Don't change branding, UI or application features as part of workflow work. **Do not merge PR #40**, and don't
  assume it's ready.

## Branching, releases and environments

Owner decisions of October 18, 2026, in force. [docs/development-workflow.md](docs/development-workflow.md) is the
authoritative reference; follow it. In short:
- `main` is production, `develop` is the private development site, and each milestone has one `release/x.y.z`
  branch cut from `develop` (only the active one exists). Work branches start from the active release branch and PR
  into it. `develop` only takes release branches, hotfixes and `chore/sync-…` back-merges; `main` only takes
  `develop` and `hotfix/…`. The **PR source** check enforces this.
- Releases: `release/x.y.z` → `develop` (merge commit; deploys to the development site), test there, then
  `develop` → `main` (merge commit). Production deploys the image tested on `develop`, only after the owner approves
  the deployment in Actions. Never merge or deploy without the owner's approval.
- Production release windows are every other Friday, America/Chicago, from October 30, 2026 (November 25 and
  December 23 replace the holiday Fridays). Windows are opportunities, not deadlines: never skip testing or approval
  to meet one.
- Milestones: v0.1.0 Foundation, v0.2.0 Accounts and profiles, v0.3.0 Calendar and approvals, v0.4.0 Communication,
  v0.5.0 Child experience, v1.0.0 Private beta (mapped to backlog items in [the backlog](docs/planning/mvp-backlog.md)).
- Deployments go to Azure (setup in [the Azure runbook](docs/runbooks/azure-environments.md)). The development site
  holds synthetic data only.
