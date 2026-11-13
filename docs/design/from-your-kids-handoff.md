# From Your Kids — M4 parent-facing handoff (#531)

Status: **implementation in progress**. Source branch: `feature/531-from-your-kids-m4` from `release/0.4.0`.

## Design references
- Approved conversation mockups: overview, diary, fridge and corkboard in desktop/mobile and light/dark.
- **Original owner reference:** [Parenthesis From Your Kids UI Collage.png](assets/Parenthesis%20From%20Your%20Kids%20UI%20Collage.png). Keep the original PNG intact. The separate art assets are served alongside live page controls and content.
- The approved implementation uses the hand-lettered heading, closed storybook fridge, illustrated journal, and framed corkboard. The overview icons and sample photos come from *Emma’s Heartfelt Photo Adventures*. The artwork cards come from *Artwork Fridge Experience*. The journal includes details from *Emma’s Cozy Diary* and the collage.
- The owner approved the responsive artwork and photos preview on November 8, 2026. The same layouts are used in light and dark mode.
- Follow [BRANDING.md](BRANDING.md) strictly: preserve existing logo artwork; light charcoal #20303F, dark ivory #F7F5ED, sage #5E8F7E, blue #4E79A7, coral #F08A6B, golden rays #F4C15D. UI uses existing design-system tokens, not the purple palette from the AI concepts.

## Product behavior
1. Parent selects child, then Diary / Artwork / Photos.
2. Diary: latest first, desktop facing pages, mobile single page, turn arrows/swipe; mood character and entry content, **no reactions/comments**. Entries are visible only to selected parents.
3. Artwork: refrigerator stays **CLOSED**; up to two drawings are magnetically attached to its upper door. Remaining drawings sit in a grid to its right on desktop and on the lower door on phones. On desktop, hovering a drawing tilts and enlarges it briefly, then it settles when the pointer leaves. Reduced motion keeps the drawing still. Open artwork details on tap/click; parent heart, short one-way comment, bookmark, download, explicit Google Photos export.
4. Photos: corkboard with child's name and pinned photos; same one-way reactions, bookmarking and explicit export.
5. Bookmark preserves artwork/photos; hearts do not. Unsaved items expire after 60 days, enforced by M5 service. Diary retained separately.
6. Parent never uploads or creates content in these views. Never automatically export. No child replies to comments.

## M4/M5 boundary
M4 owns parent-facing layout, accessible state machine and content contracts. M5 owns child authoring, consent, parent-specific sharing, real storage, retention, and API integration. **Do not display synthetic child content as if real**: only show fixtures behind a clearly labeled development preview. Default to honest empty state until the API is ready.

## QA
- In a local development build, select an active child and enable **Development preview with sample content**.
  Open Diary, Artwork, and Photos to exercise the populated states. The toggle is off by default and unavailable
  in production builds. Preview images and entries are synthetic, and the parent actions remain unavailable.
- Viewports 320/390/768/1280+, both themes, keyboard and screen reader.
- Closed fridge visible at all sizes; no open-door animation.
- Confirm child selection, diary page controls, empty states, privacy placeholders, no parent creation affordances.
- Compare the rendered overview and galleries with the approved responsive previews above, and use the original collage for the diary and broader visual direction.
