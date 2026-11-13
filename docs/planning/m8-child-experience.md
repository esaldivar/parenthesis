# M8 — Child Experience

The child experience is its own product inside Parenthesis, not a smaller parent dashboard. It is built only after
its design, privacy and legal gates pass. Research and character design may start during M5.

## Foundational principle

**A child takes part only if they want to.** Children are never responsible for keeping parents informed, maintaining
relationships or producing content. Parenthesis invites, explains and informs; it never pressures, measures or
rewards participation. Parenthesis is not a game.

## Scope

| Area | Existing issue | Notes |
|---|---|---|
| Child home, calendar, diary, memories, artwork | #179 | Read-only calendar of approved, Show-to-Kids events the child attends; three destinations |
| Consent (COPPA) and child access | #421 | Verifiable parental consent before any child data is collected; legal review blocks launch |
| Parent notices for shared child content | #131 | Never reveals private entries or their existence |
| Child photo storage quotas | #115 | Must ship with the first child uploads |
| Animated companion system (Gwenny) | #632 | Optional guide; authored, localized dialogue |
| Parent view of shared child content | #531 | Parent shell shipped in M4 with sample data; real data arrives through #179 |
| Research and companion concepts | #646 | Design only; can start in M5 |
| Conflicting rules | #647 | Must be resolved before design approval |

The child shell, profile picker, PIN and QR access already exist (ADR-0006, ADR-0007, #153). M8 builds on them; it
does not replace them. No email is required for younger children.

## Gates (in order)

1. **Research gate:** research findings and age-band UX recommendations reviewed by the owner.
2. **Design gate:** child home, calendar, memories, diary and companion designs approved (label `design approved`,
   applied by the owner only), with the conflicts below resolved.
3. **Privacy and legal gate:** counsel approves the consent method, notices, retention and deletion (#421). No
   second-parent timeout substitutes for verifiable parental consent. **No child data collection ships before this.**
4. **Build:** implementation issues created from the approved designs, each with server-side authorization tests.
5. **Launch gate:** the M7 gates re-run for the child experience, plus child-specific accessibility, privacy and
   isolation tests.

## Conflicts to resolve before design approval

These existing specifications disagree. None is chosen silently; the owner decides in #647 and the other text is updated. Epic: #648.

1. **Who a diary entry can be shared with.** `solution-architecture.md` (item 9), `design-system.md` and `CLAUDE.md`
   say *both parents or nobody* ("sharing with only one parent is deliberately left out for MVP"). #179, #421 and #531
   say the child can share with *Mom, Dad or both*.
2. **Parent comments on diary entries.** #179 allows short text-only parent comments on shared diary entries. #531
   (approved design, November 8, 2026) says diary entries are read-only for parents with no hearts, comments or
   reactions (it allows hearts and one-way comments on artwork and photos only).
3. **Deleting and expiring child content.** #115 and the backlog (M-04) say deleting child content needs both parents'
   approval. #531 says child artwork and photos expire after 60 days unless a parent bookmarks them, and #179 lets the
   child delete diary entries even after sharing. Decide which content follows mutual deletion, which expires, and
   whether a child's own deletion of their own content is exempt.
4. **Can a parent read a child's private diary?** #421 leaves this open; the design system says "Only you can see
   this". The wording a child sees must match the real rule, including any legal or retention exceptions.
5. **Companions.** #632 names Gwenny plus a cat (stretch). The November 13 brief adds a turtle (stretch). Neither
   stretch animal is a launch commitment.
6. **Where parent notices appear.** #131 puts them in parent Messaging as system notices; the M4 Notifications feed
   (#178) now exists. Decide one place.

## Companion system

**Role.** An optional guide that explains the app and gently points to what's new. It is not a therapist, a friend
substitute, a game mechanic or a parental authority.

**Architecture.** One guidance engine, many characters:
- *Guidance engine* (character independent): picks a message from authorized data events (first visit of the day,
  new event the child attends, new memory shared with the child, sharing choices on a form).
- *Dialogue catalogue*: authored, reviewed lines in English and neutral Latin American Spanish, with variants per age
  band and per character voice. **No open-ended chatbot.**
- *Character pack*: animation file, voice/personality line variants, name. Swapping packs never changes what
  information or controls the child gets.

**Data rules.** Every line is generated from data the child is authorized to see. A visible event is not an event the
child attends; lines say "you're going to" only when the child is a participant. Never invent people, events or
relationships. Never tell parents whether a child read, ignored or dismissed anything.

**Tone rules.** Invitations only ("Feel like drawing today?"). Never inactivity reminders ("It's been a while…"),
never "Mom is waiting", never comparisons between parents. Prohibited: points, streaks, badges, rewards for sharing,
leaderboards, participation scores, guilt, artificial dependency, pressure to contact a parent.

**Controls.** Minimize, mute, quiet mode, turn off; change companion at any time without losing content or settings.
Reduced motion shows a still pose. Captions always; read-aloud optional, using the device's text-to-speech first.
Keyboard and screen-reader accessible; never covers controls or interrupts reading.

**Privacy explanations.** Lines about sharing come from the real permission state ("This entry is private unless you
choose to share it"). Never promise absolute secrecy where retention, legal or safety rules allow access.

### Gwenny

Gwenny is the family's real dog: small, fluffy, cream-coloured, expressive eyes. Concept art is original 2D work based
on an **approved reference photo**, which the owner adds under `docs/design/companions/` with provenance before
concept work starts. Not a generic cartoon dog.

Animation to explore: natural blinking, mouth shapes for speech, expressions, head tilt, ear and tail movement,
breathing, walking within set UI areas, smooth transitions between states (no image swaps). Evaluate **Rive** (state
machines, small runtime for web, iOS and Android) against Lottie and sprite/skeletal options; build a working prototype
before committing.

### Cat and turtle (stretch)

Cat: relaxed, clever, slightly quirky. Turtle: calm, patient, thoughtful. Same engine, same information. Designs avoid
caricature, coded costumes, stereotyped accents and gender or culture assignment. No monkeys or pandas in the initial
exploration (owner preference).

## Research plan (can start during M5)

Deliverables, each as a section in `docs/design/child-experience-research.md`:
- Competitive analysis of co-parenting apps and their child features; where voluntary participation differentiates.
- Age-band UX (elementary, middle, high school) building on the design system's presentation bands.
- Child privacy design requirements, with the consent and notice wording for counsel.
- Companion animation feasibility (Rive prototype, performance on a mid-range phone).
- Character concepts for Gwenny (and stretch animals).
- Bilingual speech feasibility (device TTS voices for en and es-419, lip-sync approach).
- Mobile performance budget for the child shell and companion.
- Interactive prototype requirements for the design gate.

References such as Netflix-style profile selection or a game's friendly daily welcome are interaction references only;
no proprietary art, characters or interfaces are copied.
