# Roadmap after Milestone 4 (M5–M8)

Owner direction, November 13, 2026. This replaces the earlier plan for what follows Milestone 4: Child Experience as
M5, and Performance, Accessibility & Final Polish as M6. Milestones M1–M4 and their history are unchanged.

| Milestone | Release | Focus | Plan |
|---|---|---|---|
| M4 — Messaging | v0.4.0 | Active now (`release/0.4.0`): messaging, Child Essentials, Shared Records, From Your Kids (parent view), Spanish, folder reorganization | [Development workflow](../development-workflow.md) |
| **M5 — Design Refresh & UX Overhaul** | v0.5.0 | Polish the parent app: layout system, content widths, forms, cards, states, light/dark, motion | [M5 design refresh](../design/m5-design-refresh.md) |
| **M6 — Google Integrations & Native Mobile** | v0.6.0 | Epic A: Google Calendar, Maps, Photos, Sign in with Google, OAuth verification. Epic B: iOS and Android apps | [M6 plan](m6-google-and-native-mobile.md) |
| **M7 — Beta Readiness & Quality** | v0.7.0 | Quality gates for external parent beta testers: tests, accessibility, performance, security, monitoring, recovery | [M7 beta gates](m7-beta-readiness.md) |
| **M8 — Child Experience** | v0.8.0 | Child home, calendar, memories, artwork, diary, consent, companions (Gwenny), behind design, privacy and legal gates | [M8 plan](m8-child-experience.md) |
| v1.0 — Private Beta | v1.0.0 | Kept as is until the owner decides how it relates to M7 (see "Open decisions") | |

Release numbers follow the existing rule: a milestone titled `M<n> — …` belongs to `release/0.<n>.0` (see
`.github/scripts/pr-milestones.mjs` and `dependabot-release-target.mjs`). Only the active release branch exists; no
future release branch is created ahead of time.

## What changed in GitHub

- `M5 — Child Profiles` was renamed **M5 — Design Refresh & UX Overhaul**. Its four open issues (#179, #421, #131,
  #115) moved to M8. It had no closed issues, so no history moved.
- `M6 — Performance, Accessibility & Final Polish` was renamed **M6 — Google Integrations & Native Mobile**. Its
  quality issues moved to M7 (#109 Lighthouse, #110 SEO metadata, #112 WCAG testing). #111 (Search Console and domain
  verification) stays in M6 because Google OAuth verification needs the verified domain. #198 (reminder notifications
  and calendar feed) stays in M6 with the native notification work. #84 (README) moved to M4: it shipped with that
  release and is awaiting deployment.
- **M7 — Beta Readiness & Quality** and **M8 — Child Experience** were created.
- Unassigned issues placed: #632 (companions) to M8, #61 (photo storage epic, remaining iCloud and native photo
  scope) to M6, #443 (VoiceOver) to M7, #531 (From Your Kids parent view) to M4, where it shipped.
- Epics and supporting issues were added only where no issue existed:
  - M5: epic #641; #635 layout system, #636 Child Essentials, #637 reading and form widths, #638 shared states,
    #639 form and card patterns, #640 light/dark, motion and accessibility pass.
  - M6: Epic A #643 (Google integrations and verification) with #642 Sign in with Google, #111 and #198; Epic B #644
    (native apps) with #61.
  - M7: epic #645 with #109, #110, #112 and #443.
  - M8: epic #648 with #646 research and companion concepts, #647 rule conflicts, #179, #421, #131, #115 and #632.
- Dependencies are recorded as GitHub "blocked by" links: #636–#639 wait for #635, #640 for #636, #645 for #641,
  #179 for #646 and #647, #632 for #646.
- Completed work keeps its state and milestone. Issues waiting for deployment are not reopened or moved.

## Order and parallel work

```
M4 (finish, release)
  └─ M5 design refresh ──────────────┐
       ├─ M8 research + Gwenny concept (design only, in parallel)
       └─ M6 Epic A Google verification paperwork (owner actions, in parallel)
M6 Epic A Google integrations ─┐   M6 Epic B native mobile (after M5 layout system lands)
M7 beta readiness (needs M5 and M6 Epic A; native store review can finish during M7)
M8 child experience (implementation only after its design, privacy and legal gates)
```

- **Can run in parallel with M5:** M8 research, character concepts and the Rive prototype (design only, no app code);
  Google verification steps that need only the owner (domain, brand, consent screen, privacy notice wording);
  Apple and Google developer account setup.
- **Waits for M5:** native mobile UI work (it reuses M5's layout and navigation patterns), beta screenshots and store
  listings.
- **Waits for legal review:** any collection of child data (#421). M8 implementation does not start until its gates pass.

## Open decisions for the owner

These were not applied because they are ambiguous or change an earlier owner decision:

1. **v1.0 — Private Beta versus M7.** The workflow docs say v1.0.0 is the private beta. Is the external parent beta
   v0.7.0 (M7), with v1.0.0 after M8, or should M7's work be released as v1.0.0? Empty milestone #5 was left alone.
2. **Closing M2 and M3.** Both milestones are open with no open issues. Closing them is safe for release routing, but
   was not done without approval.
3. **Child-experience rule conflicts** (diary sharing audience, parent comments, child-content deletion and expiry):
   listed in the [M8 plan](m8-child-experience.md#conflicts-to-resolve-before-design-approval) and tracked in #647.
4. **Insurance information** in Child Essentials was named in the M5 brief but does not exist in the app today. Adding
   it would be a new feature, not a design refresh. It needs its own issue if wanted.
5. **Gwenny reference photo.** No approved reference photo is in the repository. The owner needs to add one (with
   provenance) under `docs/design/companions/` before concept art starts.
