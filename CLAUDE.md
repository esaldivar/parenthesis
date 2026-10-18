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

## Development workflow automation (owner brief, October 18, 2026)

Status: **brief recorded, not implemented.** Do the inspection in step 11 and report to the owner before
changing any workflow, setting or document. Once `docs/development-workflow.md` exists, it becomes the authoritative
reference: shorten this section to a link to it rather than keeping two copies.

This is a workflow automation task, not application work. Do not modify Parenthesis branding, UI, or application
features.

### 1. Weekly pull request limits
- Maximum 3 new development PRs per week.
- Maximum 6 GitHub Copilot reviews per week.
- Maximum 2 Copilot reviews per PR: one initial review and one follow-up review.
- No automatic re-reviews. No rollover of unused weekly allowance.
- Additional PRs or reviews require owner approval.
- Weekly limits reset every Monday at 12:00 AM, America/Chicago time.
- Count only new development PRs opened during the week. Existing PRs remain valid and do not count as newly created.
- Reopening an existing PR must not reset its review count.

### 2. PR creation rules
Before creating a development PR:
1. Check the number of development PRs created this week.
2. Verify the weekly limit has not been reached.
3. Check whether existing work can be grouped into one PR.
4. Avoid unnecessary PRs for minor changes.
5. If the limit is reached, continue development without opening another PR.
6. Request owner approval before exceeding the limit.

Never automatically merge PRs. Do not bypass the weekly limits by creating duplicate PRs.

### 3. GitHub Copilot review management
- At most 6 Copilot reviews per week; per PR, review 1 (initial) and review 2 (follow-up after corrections).
- Do not automatically request another Copilot review after every commit or push.
- Additional reviews require explicit owner approval.
- Inspect the actual Copilot configuration and use the review settings GitHub really offers. Do not assume a
  "Copilot Lite" option exists.
- Determine which review requests can be controlled programmatically. If automatic reviews cannot be reliably
  disabled, report the limitation and the required repository settings.

### 4. GitHub Actions enforcement
Investigate workflows that enforce or monitor the limits. They should track development PR creation, observable
Copilot review requests and weekly review usage; warn when limits are approaching; report when they are reached;
prevent automation from exceeding them; and respect owner-approved exceptions.
- Do not claim Actions can prevent things GitHub does not expose for enforcement.
- Clearly separate: automatically enforceable restrictions; monitoring and reporting; restrictions that need
  repository settings; restrictions that need manual owner approval.
- Use least-privilege permissions. Do not expose secrets to untrusted PR code.

### 5. Discord webhook notifications
Use the existing Parenthesis Discord webhook integration to keep the owner informed without constant GitHub
monitoring.

Notify when:
1. A major PR is being prepared.
2. A major PR is opened or ready for review.
3. A PR targeting a release branch is ready for review.
4. A release candidate requires owner approval.
5. Significant risks or blockers affect a major PR.

Skip routine minor commits, small documentation updates and minor styling changes.

A PR is **major** if it includes any of: multiple significant features; major architectural changes; authentication
changes; security-sensitive changes; database migrations; significant changes to core functionality; major
infrastructure changes; release preparation. Any PR targeting a release branch always gets the notification,
regardless of size.

Each message includes: PR title and number; PR link; source and target branches; plain-English summary; features
added, modified or removed; important technical changes; tests performed and results; known issues and risks;
outstanding work; whether owner approval is required. Keep it concise and never send a whole diff.

Example:

```text
PARENTHESIS — MAJOR PR READY

PR: #52 — Household Authentication Updates
Branch: feature/household-auth
Target: develop

Changes:
- Improved parent authentication.
- Added child PIN recovery.
- Updated session handling.

Testing:
- Unit tests passed.
- Integration tests passed.

Risks:
- Authentication changes require review.

Status: Awaiting owner approval.
GitHub: [PR URL]
```

Timing:
- Before opening a major PR, Claude prepares and sends a summary through the approved Discord integration, if
  available.
- After a major PR opens, and when a release PR becomes ready, GitHub Actions notifies automatically.
- Avoid duplicate notifications for the same event. If a notification fails, report it; never assume delivery.

### 6. Discord security
- Use the existing webhook configuration where possible; verify it before creating a new one. Do not replace a
  working integration without owner approval.
- Store webhook URLs in GitHub Actions secrets. Never commit them or print credentials in logs.
- Never send sensitive user information to Discord.
- Use minimal workflow permissions and never run untrusted PR code with secret access.

### 7. Development continuity
When weekly PR or review limits are reached, Claude may keep implementing approved features, writing tests, fixing
bugs, updating documentation and committing to appropriate development branches. Claude must not create
unauthorized PRs, request unauthorized Copilot reviews, bypass repository safeguards, or merge automatically.

### 8. Weekly status report
From actual GitHub activity, report: development PRs created this week; remaining PR allowance; Copilot reviews used;
remaining review allowance; PRs awaiting review; major changes completed; work waiting for the next PR slot; release
readiness; important blockers. Mark unavailable or incomplete metrics as such and never invent counts. It may be
delivered through the approved Discord webhook.

### 9. Existing repository rules
Respect existing standards and preserve the branching strategy in [CONTRIBUTING.md](CONTRIBUTING.md). Do not modify
approved branding, regenerate the logo, redesign approved UI components, change unrelated application
functionality, or overwrite existing workflow documentation. **Do not merge PR #40**, and do not assume it is ready.

### 10. Documentation (after implementation approval)
Create or update `docs/development-workflow.md` covering: weekly PR limits; Copilot review limits; the exception
approval process; Discord notification triggers; major PR classification; release notification requirements; what
GitHub Actions can enforce; known technical limitations. Then point this file at it without duplicating or
conflicting with it.

### 11. Required inspection before coding
Before modifying anything (and without modifying files during inspection):
1. Inspect existing GitHub Actions workflows.
2. Review repository permissions and settings.
3. Identify existing Copilot review automation.
4. Locate the Discord webhook integration.
5. Inspect the current branching strategy.
6. Identify existing PR policies.
7. Check for conflicting automation.
8. Determine what GitHub can actually enforce.

Then report: existing workflow configuration; proposed Actions changes; files to create or modify; PR counting
strategy; Copilot review counting strategy; Discord notification implementation; security considerations; technical
limitations; testing plan. **Wait for owner approval before implementation.**

### 12. Acceptance criteria
- [ ] Weekly development PR limit is 3.
- [ ] Weekly Copilot review limit is 6.
- [ ] Maximum 2 reviews per PR.
- [ ] Automatic re-reviews are disabled where supported.
- [ ] Additional reviews require owner approval.
- [ ] Weekly counters reset correctly.
- [ ] Discord notifies for major PRs.
- [ ] Discord notifies for release PRs.
- [ ] Notifications include change summaries and test results.
- [ ] Duplicate notifications are minimized.
- [ ] Webhook credentials remain secure.
- [ ] Development can continue after limits are reached.
- [ ] Existing workflows remain functional.
- [ ] Documentation is updated.
- [ ] CLAUDE.md references the workflow rules.
- [ ] No unrelated application changes occur.

If a requirement cannot be technically enforced, document the limitation and propose an alternative. Do not
redesign Parenthesis, modify application features, or create unnecessary PRs.
