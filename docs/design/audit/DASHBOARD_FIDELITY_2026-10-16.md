# Dashboard design-fidelity audit — October 16, 2026

Follow-up to #22. Compares the rendered parent dashboard with:

- [`APPROVED_DASHBOARD_2026-10-16.md`](../APPROVED_DASHBOARD_2026-10-16.md)
- the approved image, present as [`assets/3116E10A-DADF-4661-9CD2-B7A9529B33AD.png`](../assets/3116E10A-DADF-4661-9CD2-B7A9529B33AD.png) (1536 × 1024)
- [`BRANDING.md`](../BRANDING.md)

**What this audit does not claim.** The spec asks for the exact image at
`assets/approved-dashboard-2026-10-16.png` before anyone claims pixel-level fidelity. That path still doesn't exist.
The `3116E10A…png` upload is assumed to be that image, but nobody has confirmed it. So the comparisons here are visual
and side by side, not pixel diffs, and **the dashboard does not match the mockup**. The remaining gaps are listed below.

## How it was checked

- **Rendered app.** The dev build (`ng serve`) talked to the local API, signed in as a synthetic `@example.test`
  account that was created and email-confirmed locally.
- **Data.** Captures used the labelled sample preview (`/?sample=1`). The live dashboard was also captured; it shows the
  honest "calendar isn't available yet" state.
- **Capture.** Headless Edge over the DevTools protocol, at device scale factor 1, with `prefers-color-scheme` emulated.
  Each capture also recorded whether the page scrolled horizontally.
- **Viewports.** Desktop 1536 × 1024 (the mockup's size) and 1920, light and dark. Laptop 1280. Tablet 1024 × 768 and
  768 × 1024. Phone 375 and 320 (dark).
- **Result.** No viewport scrolls horizontally, before or after.
- **Today.** Friday, October 16, 2026, evening, in the family's time zone (America/Chicago). The week shown is Sunday,
  October 11 to Saturday, October 17.

Comparison images:

- Desktop: [`compare-desktop-1536.png`](2026-10-16/compare-desktop-1536.png) and
  [`compare-desktop-1536-dark.png`](2026-10-16/compare-desktop-1536-dark.png), each showing mockup, before and after.
- Tablet: [`compare-tablet.png`](2026-10-16/compare-tablet.png), before and after at 1024 and 768.
- Phone: [`compare-mobile.png`](2026-10-16/compare-mobile.png), before and after at 375 light and 320 dark.

## Discrepancy report (found on `feat/angular-shell` @ 17d4f23)

| # | Component | Expected (approved) | Actual (before) | Severity | Correction |
|---|---|---|---|---|---|
| 1 | Timed activities | Each activity shows its children's avatars | At 1536px the avatars were cut off or hidden on all 5 sample activities. School Drop-off and Dentist showed none; Piano, Soccer and Art showed a sliver. The cards were shorter than their content. | **Critical** | **Fixed.** Cards are at least 9 slots tall and use a grid layout. Avatars sit beside the time, or on their own row when there are two or more children. Wide cards (≥900px) match the mockup: icon beside the title and time, avatars centred below. |
| 2 | Sidebar active item | Home highlighted with a sage pill on the dashboard | Not highlighted whenever the URL had a query (`?week=…`, which week navigation adds, or `?sample=1`). `aria-current` was missing too. | **Major** | **Fixed.** Matching ignores the query, fragment and matrix params; Home still needs an exact path. Regression test added. |
| 3 | Calendar proportions | Compact time grid, about 21px per hour; the calendar ends above the lower card row | 36px per hour. The grid alone was 468px and the lower cards started about 1,100px down. | **Major** | **Partly fixed.** About 22px per hour in wide cards and 28px per hour in narrower ones (so avatars fit). The proposals strip is compacted. Still taller than the mockup: see R1. |
| 4 | Three-column layout | Calendar with Upcoming and Quick Add beside it; three cards below | Correct at 1536px | — | Kept. The breakpoint moved from 1180 to 1120px container width, because the wider, mockup-sized sidebar would otherwise have dropped 1536px to two columns. |
| 5 | Sidebar size | About 320px wide, about 19px nav labels, large leaf cluster with the tagline | 272px wide, 17px labels, small leaves | Minor | **Fixed.** 312px wide, 19px labels, 28px icons. The leaves are larger and shrink to fit on short screens. |
| 6 | Card surfaces | White cards with soft elevation, no visible outline | Flat, with a 1px border | Minor | **Fixed (light theme).** New `--shadow-card` token. Dark mode keeps borders with no shadow, as `design-system.md` requires. |
| 7 | "See all" links | Unadorned teal text | Underlined | Minor | **Fixed.** Underline appears on hover and focus only. These are standalone links, not links inside body text. They no longer wrap at 320px. |
| 8 | All-day block | Bigger overlapping avatars (about 40px); medium-weight title | 38px avatars, bold title | Minor | **Fixed.** 40px avatars, more overlap, 600-weight title. |
| 9 | Family Memories | Dots between the image and the title; date like "Oct 14, 2026" | Dots under the date; "Wednesday, October 14" | Minor | **Fixed.** The tile is also capped at 26rem, so it doesn't grow huge when the card spans two columns. |
| 10 | Header leaves | Large leaf cluster at the top right | Small sprig | Minor | **Partly fixed.** About 1.5× larger. The illustration itself is still simpler than the mockup's (see R6). |
| 11 | Sample banner | n/a (mockup has no banner) | Two-line, 90px | Minor | Kept, because labelled sample data is required. Now one line at desktop sizes. |
| 12 | Proposal card at 320px | Readable | Title squeezed to one word per line | Minor | **Fixed.** The Proposed label wraps below. |
| 13 | Sidebar at 1024 × 768 | Profile button visible | (after #5) the profile was pushed below the fold | Minor | **Fixed.** The decoration shrinks first. |

## Checklist

### Visual design

| Item | Result |
|---|---|
| Palette: ivory canvas, white cards, sage, forest text, teal actions | PASS |
| Sage accents: active nav, all-day block, today | PASS (active nav was FAIL; fixed) |
| Typeface | PARTIAL: platform sans, where the mockup uses a rounded sans. The typeface is still open in BRANDING.md (R5). |
| Weights and sizes | PASS after fixes 5 and 8 |
| Card radii (18px cards, 12px controls) | PASS |
| Shadows and borders | PASS (fix 6) |
| Spacing and proportions | PARTIAL (R1) |
| Icons: line icons, category icons, gear, pencil, album | PASS |
| Illustrations and photos | PARTIAL: decorative leaves only; no photos or artwork (R3, R6) |
| Hierarchy | PASS |

### Sidebar and shell

| Item | Result |
|---|---|
| Order: Home, Calendar, Messages, From Your Kids, Family Memories, Child Essentials, Settings | PASS |
| Calendar is standalone (no chevron); Child Essentials is top level | PASS |
| Active state | PASS (fix 2) |
| Unread badges on Messages and From Your Kids | FAIL, blocked: no data source; counts not invented (R4) |
| Logo: Variation 1 icon + Option B wordmark | FAIL, blocked: text-only asset-pending state (R2) |
| Bell with badge in the top bar | FAIL, blocked: no notifications feature (R4) |
| Tagline and profile ("Hi, Mom!") | PASS (initials avatar; R3) |

### Dashboard components

| Item | Result |
|---|---|
| Greeting with sun and subtitle | PASS |
| Upcoming: labels, dates, avatars, See all | PASS. Also lists a pending review first; data-dependent items. |
| Quick Add: Event, Message, Memory, Note | PASS (honest disabled placeholders, explained) |
| From Your Kids | PARTIAL: placeholder tiles instead of artwork or photos; no unread dot (R3, R4) |
| Recent Messages | PARTIAL / AMBIGUOUS: the mockup shows messages from the children (R7) |
| Family Memories carousel | PASS for layout (fix 9); photo is a placeholder (R3) |

### Calendar requirements

| Item | Result |
|---|---|
| Week view default; previous/next, Today, Week/Month/List | PASS |
| Current day clearly indicated | PASS |
| One continuous "Time with Dad" block across Sun–Sat | PASS |
| Parent and children avatars inside the block | PASS (initials; children alphabetical as decided) |
| Activities in day and time slots below the all-day row | PASS |
| Each activity shows its children's avatars | PASS (was FAIL; fix 1) |
| Category icons and colours, with text and tooltips | PASS |
| Overlapping activities understandable | PASS (side-by-side lanes) |
| Proposed changes not shown as confirmed | PASS |
| Split-child view | PASS |

### Responsiveness, accessibility and branding

| Item | Result |
|---|---|
| Desktop 1536 / 1920 | PASS (3 columns) |
| 1280 | PASS (2 columns) |
| Tablet 1024 / 768 | PASS: the calendar uses the agenda form below a 720px card width |
| Phone 375 / 320, light and dark | PASS. No horizontal overflow anywhere (measured). |
| Keyboard, screen-reader names, axe checks in tests, contrast tests | PASS (190/190 unit tests including axe; 96 contrast pairs) |
| Branding rules: no redrawn or approximated logo | PASS |

## Remaining discrepancies

These are not fixed, either because they need something this PR doesn't have or because they need your decision.

- **R1 — Calendar height.** At 1536px the lower card row starts about 290px lower than in the mockup. There are three
  causes:
  - The required sample-data banner (about 40px).
  - The proposals strip and split toggle (about 130px). The mockup has no proposal; showing one off the grid is how
    #22 keeps proposals from looking confirmed.
  - Cards in the mockup are about 125px wide and spill over their 105px day columns. That's how the mockup fits icon,
    title and avatars in its compact rows. Ours stay inside their columns, so in an 820px card they stack the icon above
    the title and need slightly taller rows.

  To change any of these, tell me which.
- **R2 — Logo.** BRANDING.md says the icon can't be approximated. The wordmark exports in `assets/` are defective,
  and the icon on its own hasn't been approved for use, so the text-only pending state stays.
  - Separately, `APPROVED_ASSET_MANIFEST.md` expects the brand board at `parenthesis-approved-brand-board.jpeg`. The
    committed `F61791C0-…jpeg` has the manifest's SHA-256 (`af89374a…7e34`), so the file is present under another name.
- **R3 — Photos.** There are no approved synthetic photo avatars, artwork or memory photos, so initials and tinted
  placeholder tiles are used. The mockup's realistic child photos can't be reused under the abstract and inclusive
  rules for people.
- **R4 — Badges and the bell.** The mockup shows counts (3 and 2) and a notification bell. There's no notifications or
  unread API, and inventing numbers would be dishonest. The kid-share unread dot needs the same data.
- **R5 — Typeface.** The mockup's rounded sans isn't chosen yet ("Still open" in BRANDING.md).
- **R6 — Decorative art.** The mockup has a sage wave behind the tagline and fuller leaf clusters. These are within
  the approved direction, but there's no source artwork to match, so redrawing them more fully would be invention.
- **R7 — Ambiguities in the mockup.**
  - **Recent Messages.** The mockup shows messages from Aurora and Kai to Mom. The sample shows messages from the other
    parent. Which conversations belong in this card is a product decision.
  - **Dates.** The mockup's week "Oct 12 – 18, 2026" labels Oct 12 as Sunday, but in 2026 Oct 12 is a Monday. We show
    the real calendar.
  - **Today marker.** The mockup's circle reads "Oct" with no day number. Treated as an image artefact; we show
    "Oct 16".
  - **Avatar order.** The mockup shows Dad, Kai, Aurora. Children are alphabetical, as you decided on October 16.

## Missing dependencies

- The exact approved dashboard image at `docs/design/assets/approved-dashboard-2026-10-16.png`, or confirmation that
  `3116E10A…png` is it.
- Corrected horizontal wordmark exports, or approval to use the verified icon with the text wordmark.
- Approved synthetic, abstract photo and artwork assets for avatars, kid shares and memories.
- Backend APIs: calendar and parenting time, change requests, kid shares, messages, memories, and
  unread/notification counts.
- A typeface decision.
