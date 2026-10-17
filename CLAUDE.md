# Parenthesis: Claude Code handoff

Read [docs/design-system.md](docs/design-system.md) and the [brand handoff](docs/design/README.md) before designing or implementing UI. The root README displays a provisional logo SVG from `docs/design/assets/parenthesis-logo-concept.svg`; refine and replace it only after visual approval. Keep the README concise: show the logo and link the design guide rather than copying the full styling specification.
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
