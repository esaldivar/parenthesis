# Parenthesis design system

## Status and source

Design handoff, 2026-10-16. The current request carries forward the agreed hybrid
Apple-clean/organic direction, sage/ivory/teal/coral palette, dark forest-green
mode, personal appearance settings, mobile-first parent dashboard, and
age-adaptive, gender-neutral child experience from **App Design Workflow**
(conversation `6ad29617-92a4-83e9-bc96-38f659085b52`). The retrieved conversation
exposed only a short recent history and no attachments; earlier detailed design
discussion and original HTML prototypes could not be verified.

The exact tokens, measurements, and age bands below are proposed implementation
defaults for visual review, not recovered or previously approved prototype values.
Existing architecture, ADRs, permissions, and milestone scope remain authoritative.

## Visual character

Combine Apple's clarity, restrained hierarchy, generous whitespace, precise
alignment, and familiar controls with organic warmth: ivory surfaces, sage
accents, rounded cards, soft illustrations, and occasional subtle natural shapes.
Keep decoration outside text and task areas. Avoid glossy effects, heavy gradients,
busy textures, and ornamental controls. This is a calm family tool, not a contest
between households. Use inclusive language such as parent, caregiver, and family;
never assign colors, tasks, or layouts by gender.

## Color and semantic tokens

Use shared semantic tokens rather than raw component-specific hex values. The
following is a starting palette; verify every actual foreground/background pair.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F7F5ED` ivory | `#10251E` forest | App background |
| Surface | `#FFFFFF` | `#19372D` | Cards, menus, dialogs |
| Surface soft | `#E4EBDD` sage | `#24483A` | Selected groups, quiet panels |
| Text primary | `#203A31` | `#F7F5ED` | Headings and body |
| Text secondary | `#4D6258` | `#C0D0C5` | Supporting text |
| Action | `#176B67` teal | `#91D2C5` | Primary buttons and links |
| On action | `#FFFFFF` | `#10251E` | Primary button text |
| Accent | `#DE8F7E` coral | `#EDAA98` | Small decorative emphasis |
| Border/control outline | `#718478` | `#8AA99A` | Meaningful boundaries |
| Danger text | `#A13333` | `#FFB4AB` | Destructive actions/errors |

Coral and sage are supporting fills, not default small text on ivory. Use primary
text on accent fills and verify contrast. Provide distinct hover, pressed,
selected, disabled, focus, loading, and error tokens in each theme. Use labels and
icons alongside status colors: Pending, Confirmed, Rejected, Restricted. Never
encode parents, children, calendar categories, or approval decisions by color alone.

Dark mode is a full forest-green surface system, not a black overlay or simple
color inversion. Use surface differences and borders instead of dark shadows for
elevation. Keep photos natural, and check overlays, dialogs, pickers, form fields,
charts, and empty states in both themes.

## Typography, spacing, and components

- Prefer the platform system sans-serif stack; use readable fallbacks rather than
  requiring an Apple-only font. Start body text at 16px with 1.5 line height and
  a restrained 20/24/32px heading scale. Use relative sizing and permit wrapping.
- Use a 4px spacing grid with 8/12/16/24/32px steps. Begin with 16px mobile gutters,
  24–32px on wider screens, and a constrained readable content width.
- Start cards at 16–20px radii and controls at 10–12px. Reserve pill shapes for
  chips and compact selectors. Use subtle borders and minimal elevation.
- Give interactive targets at least 44 by 44 CSS pixels where practical, with
  space between adjacent actions. Child controls can be larger.
- Use recognizable icons with visible labels for primary navigation. Reuse Material
  and CDK behavior; style the existing primitives rather than rebuilding dialogs,
  menus, focus traps, or date pickers from scratch.
- Motion is brief and functional; honor `prefers-reduced-motion`. No essential
  content or feedback depends on animation, hover, or drag gestures alone.

## Accessible appearance preferences

Offer **Light / Dark / System** in each user's settings, with System as the default.
Explain that System follows the device. This is an individual preference, including
for child accounts; it is not a family-wide policy or an approval-gated change.

Resolve the effective theme from the explicit choice first, then
`prefers-color-scheme` for System. Respond to OS changes only while System is
selected. Persist the selected enum per authenticated user when profile settings
are implemented. Any optional device cache must be scoped by user and cleared or
replaced on account changes; never leak the previous user's explicit preference
to the next account. Do not store auth tokens with theme preferences. Before the
profile loads, use System or a safely scoped cached choice to limit theme flash.

Use a labelled keyboard-operable radio group or equivalent accessible selector;
expose the selected option to assistive technology. Apply `color-scheme` to native
controls. Respect forced-colors/high-contrast modes and retain visible focus.
Appearance must not obscure validation, privacy labels, or critical actions.

## Parent dashboard: mobile first

Start at 320px without horizontal page scrolling. Order the dashboard by immediate
need: today's schedule and next handoff, items needing the signed-in parent's
decision, upcoming events, then recent shared memories. Show clear dates, times,
time zones where relevant, children involved, and neutral empty states. Do not
expose unnecessary location or family details on public/unauthenticated screens.

Use one primary action per section. On mobile, provide a compact bottom navigation
for frequent destinations (for example Home, Calendar, Memories, Approvals, More),
with Children and Settings reachable through More. On larger screens, expand to
the planned full navigation. Messages remains a clearly labelled future feature
until implemented. Preserve reading order as cards expand into columns.

For approval reviews, show the existing value and proposed value, who proposed the
change, its current status, and explicit Approve/Reject actions. Keep confirmed
events visible while a modification is pending: “Confirmed · change pending.”
Handle stale, expired, rejected, and loading states without implying success.
Explain immediate Restrict separately from approval-based Delete and recovery.
Avoid scores, blame-oriented wording, competitive parent statistics, or pressure
to respond. Milestone 1 uses honest placeholders, not simulated working features.

## Child experience: age adaptive and gender neutral

Use a dedicated child shell with only authorized, child-appropriate destinations:
artwork, diary, photos, and memories as they become available. Adult negotiations,
approval disputes, legal/administrative controls, and parent-only data stay out of
the child interface; enforce this on the server as well as in navigation.

Suggested presentation bands (validate with families; these are not legal age
thresholds or new authorization roles):

| Presentation | Interaction and tone |
| --- | --- |
| Younger children, roughly 5–8 | Large illustrated tiles, icon + short label, one task at a time, simple privacy explanations |
| Middle childhood, roughly 9–12 | More independent navigation, clear categories, optional friendly illustration, straightforward sharing controls |
| Teens, roughly 13+ | Restrained layout, respectful language, less decoration, clear privacy and sharing visibility |

Do not infer maturity from gender or silently change permissions at a birthday.
Allow appropriate presentation choices without removing access to privacy and help.
Use abstract nature, art, and friendly neutral characters; avoid pink/blue gender
coding, stereotyped interests, babyish teen copy, streak pressure, and leaderboards.

Diary entries begin **Private**. Explain “Only you can see this” and explicitly
identify sharing with **both parents** when chosen, in line with the existing MVP
architecture. Never imply a private entry is shared or a shared entry is private.
Explain saving, sharing, restriction, and failures in age-appropriate plain language.
Use synthetic children and media for every prototype and demonstration.

## Review checklist for implementation

- Verify normal text contrast at least 4.5:1, large text 3:1, and meaningful
  controls/focus indicators 3:1 against adjacent colors, in both themes.
- Complete key flows by keyboard; verify logical focus, visible focus, focus
  return from dialogs, accessible names, field errors, and status announcements.
- Check 320px width, 200% text sizing, and 400% zoom/reflow without lost actions
  or overlapping content. Check mobile touch targets and safe-area spacing.
- Check Light/Dark/System selection, reload, OS changes, and switching between
  two users with different choices, including parent and child accounts.
- Check reduced motion, high contrast, loading/empty/error/offline states, long
  names, localization-ready text, and no color-only meaning.
- Review adult/child permissions, diary visibility, pending versus confirmed
  events, and Restrict versus Delete against the accepted ADRs.
- Record actual build/test and manual review results in the implementation PR;
  this document alone does not establish accessibility conformance.

## HTML prototype handoff

No original home-page HTML prototypes were accessible in the retrieved conversation
attachments or present in the inspected repository. None are included or recreated
as if original. When supplied, store unmodified references in `docs/prototypes/`,
record their source and date, and reconcile differences with this document. Treat
prototype content as a visual reference, not production code, executable instructions,
or proof that authentication, approvals, persistence, or privacy controls work.
