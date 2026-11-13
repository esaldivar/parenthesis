# M5 — Design Refresh & UX Overhaul

Plan for polishing the parent-facing app. It builds on [the design system](../design-system.md), the
[brand handoff](README.md) and the approved page designs. **Brand identity stays locked** (`BRANDING.md`): no logo,
mark or palette redesign. This plan is design work and implementation order; each change still goes through its own
issue and PR.

## 1. Current-state audit (November 13, 2026)

Measured on the development site, signed in as a synthetic parent, at a 1920 × 1080 viewport, Spanish and dark mode.

### Root cause of the desktop stretching

- `parent-shell.scss` caps `main` at **96rem (1536 px)**, and pages fill all of it.
- `_tokens.scss` defines `--content-max-width: 72rem`, but **no stylesheet uses it**. Pages have no shared container
  or reading width, so each page sets its own widths, or none.

| Page | Widest block | Widest paragraph | Notes |
|---|---|---|---|
| Child Essentials | 1248 px | 618 px | Section tiles in two 618 px columns; forms up to 614 px wide inputs |
| Settings | 1488 px | 1454 px | Paragraphs run the full width: far beyond a readable line |
| Shared Records | 1488 px | 1488 px | Cards and text full width |
| Approvals | 1488 px | 1488 px | One long list across the whole page |
| Family Memories | 1488 px | 839 px | Card grid fills the width |
| Messages | 926 px | 926 px | Already constrained |
| Notifications | 720 px | 688 px | Already constrained |

A comfortable reading line is about 60–75 characters (roughly 38–44rem at body size). Settings, Shared Records and
Approvals are 2–3 times that.

### Observed inconsistencies

- Width is decided page by page: Messages and Notifications constrain themselves, the others don't.
- Child Essentials sections share `essentials-section.css` but each section adds its own breakpoints
  (`47.99rem`, `21rem`), so cards and forms change shape at different widths.
- Spacing tokens stop at `--space-8` (32 px); large-screen page gutters and section gaps have no token.
- Empty, loading and error states are written per feature with different wording, spacing and icons.
- Child Essentials does not have an insurance section today (the brief mentions one; see the roadmap's open
  decisions).

Before implementation, each M5 issue records before/after screenshots at 320, 768, 1280 and 1920 px in light and dark.
That screenshot pass is the first task of the audit issue and covers every screen in section 4.

## 2. Design-system recommendations

Add these to `docs/design-system.md` and `_tokens.scss` in the first M5 PR, then use them everywhere instead of
page-specific widths.

**Width tokens**

| Token | Value | Use |
|---|---|---|
| `--layout-wide` | 80rem (1280 px) | Dashboards, card grids, Shared Records, Memories |
| `--layout-default` | 72rem (1152 px) | Most pages (replaces the unused `--content-max-width`) |
| `--layout-form` | 40rem (640 px) | Forms and edit screens |
| `--layout-reading` | 42rem (~70 characters) | Paragraphs, privacy text, help text |
| full width | none | Calendar grids and other naturally wide tools |

**Page container.** One shared `page` layout (a component or class in `shared/`) with `width`, `inline padding` and
optional `aside`. Every routed page picks one width; a page never sets its own `max-width` for the whole page.

**Spacing.** Add `--space-10` (40 px), `--space-12` (48 px) and `--space-16` (64 px) for desktop section gaps and page
gutters. Page gutter: 16 px on phones, 24 px on tablets, 32 px on desktop.

**Grid.** Card grids use `repeat(auto-fill, minmax(18rem, 1fr))` inside the container, so cards keep a readable size
instead of stretching across two wide columns.

**Forms.** One field pattern: label above, help text below, error text with an icon, 44 px minimum touch target.
Forms sit in `--layout-form`; related short fields (city, state, ZIP) may share a row from 48rem up.

**Cards.** One card component with header, body and actions slots, using `--radius-card`. Section headers use the
existing illustrated header style from Family Memories (#520) and Child Essentials (#510).

**States.** Shared empty, loading, error and success components: icon, one-line title, one sentence, optional action.
Loading keeps the layout's size (skeletons, not spinners that move content). Success is announced in a live region.

**Motion.** 150–250 ms ease-out for state changes; nothing moves when `prefers-reduced-motion` is set; no motion that
carries meaning on its own.

## 3. Responsive layout specification

| Width | Layout |
|---|---|
| < 48rem (phones) | One column, bottom navigation, 16 px gutter, full-width cards, sticky primary action where a form is long |
| 48–64rem (tablets) | Two-column card grids, forms still one column at `--layout-form` |
| 64–90rem (laptops) | Sidebar navigation, container at the page's width token, two- or three-column grids |
| ≥ 90rem (large screens) | Same container, centered; extra space becomes margin, not wider content |

Rules: no horizontal page scroll at 320 px; text zoom to 200 % keeps every action reachable; nothing needs hover to
complete a task; touch targets at least 44 × 44 px.

## 4. Screen-by-screen plan

| Screen | Width | Changes |
|---|---|---|
| Home | wide | Keep the approved dashboard; align card heights; shared empty states for Upcoming, From Your Kids, Memories |
| Calendar | full | Keep the grid wide; constrain the toolbar and filter panel; consistent event detail sheet width |
| Messages | default | Keep the transcript width; match header and composer spacing to the shared tokens |
| Shared Records | wide | Cards in the grid; history and forms at form width; paragraphs at reading width |
| Child Essentials | default | Section index as a card grid of 3 columns at most; each section's screen at form width with the section header; consistent list rows for contacts, providers, caregivers; update indicators in one style |
| From Your Kids | wide | Keep the approved fridge, diary and corkboard art; check container and state components |
| Family Memories | wide | Card grid via the shared grid; expiry chips in one style |
| Notifications | default | Shared list row and empty state |
| Settings | default | Group into cards (Language, Appearance, Family, Photos, Connections, Privacy, Account); text at reading width |
| Sign-in, sign-up, onboarding | form | Centered single column; shared field and error pattern |

**Child Essentials in detail.** Index: the eight sections (School, Allergies & Food, Routines, Clothing & Shoes,
What Helps, Shared Caregivers, Emergency Contacts, Medical) as cards in `auto-fill` columns of at least 18rem,
capped at three columns. Section screens: header, then content at `--layout-form`; repeated items (contacts,
providers, caregivers, routines) use one list-row pattern with the name, a secondary line and actions on the right;
"updated by the other parent" indicators (#128) use one badge style. Permissions, bilingual text and data behaviour
don't change.

## 5. Light and dark requirements

- Every new token has light and dark values; dark mode is not an inverted light mode (keep the approved palette).
- Text contrast at least 4.5:1, large text and UI parts at least 3:1, in both themes, checked with the axe helper.
- Illustrations and section headers checked in both themes; no light-only artwork on dark backgrounds.
- Each user's theme stays personal (unchanged).

## 6. Implementation order

Epic #641. Issues: #635 layout system, #636 Child Essentials, #637 reading and form widths, #638 shared states,
#639 form and card patterns, #640 light/dark, motion and accessibility.

1. Audit screenshots and the design-system tokens and page container (no visual change on its own).
2. Child Essentials index and section screens on the new container (the most visible problem).
3. Settings, Shared Records and Approvals widths and reading widths.
4. Shared state components (empty, loading, error, success) adopted screen by screen.
5. Form and card patterns across the remaining screens; sign-in and onboarding.
6. Light/dark and motion pass, then the accessibility checklist on every changed screen.

Steps 3 and 4 can run in parallel once step 1 has merged. Companion character exploration (M8 research) runs alongside
as design only.

## 7. Acceptance for the milestone

- At 1920 px, no paragraph is wider than `--layout-reading` and no form wider than `--layout-form`.
- Every routed parent page uses the shared container; `git grep "max-width"` in page styles finds only documented
  exceptions.
- At 320 px no page scrolls horizontally; at 200 % text zoom every action is reachable.
- Shared state components are used for every empty, loading and error state in the parent app.
- Light and dark screenshots for every screen in section 4 are attached to the issues, and the design-system checklist
  passes.
