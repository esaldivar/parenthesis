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
3. Artwork (redesigned in #714 from the approved Figma Artwork frames): a closed sage retro fridge, the same when
   empty (with "No artwork shared with you yet."). The three newest drawings hang on it with coloured magnets, one
   on the top door and two on the bottom, slightly tilted; a handwritten "View all artwork" Post-it on a magnet
   opens the gallery when there are more. Hover or keyboard focus straightens and enlarges one drawing in front of
   the others with the Photos yellow glow and hides its magnet. The newest-first gallery shows drawings whole on
   cream mats, and the detail matches Photos: a heart over the corner and one editable parent comment. Bookmark,
   download and Google Photos export aren't part of the approved Artwork design.
4. Photos (redesigned in #710 from the approved Figma Photos frames): a decorated corkboard with no name plaque or
   on-board message when empty; three newest photos pinned left tilt, straight, opposite tilt, with thumbtacks; a
   handwritten "View all photos" Post-it when there are more. Hover or keyboard focus enlarges one photo in front of
   the others with a yellow glow and hides its tack, without moving the rest. The newest-first gallery and a photo's
   detail replace the page, with "Back to From Your Kids" at the top and the same child selected; the detail has a
   heart over the photo's corner and one editable parent comment. Bookmarking and export aren't part of the
   approved Photos design.
5. Bookmark preserves artwork/photos; hearts do not. Unsaved items expire after 60 days, enforced by M5 service. Diary retained separately.
6. Parent never uploads or creates content in these views. Never automatically export. No child replies to comments.

## M4/M5 boundary
M4 owns parent-facing layout, accessible state machine and content contracts. M5 owns child authoring, consent, parent-specific sharing, real storage, retention, and API integration. **Do not display synthetic child content as if real**: only show fixtures behind a clearly labeled development preview. Default to honest empty state until the API is ready.

## QA
- In a local development build, select an active child and enable **Development preview with sample content**.
  Open Diary, Artwork, and Photos to exercise the populated states. The toggle is off by default and unavailable
  in production builds. Preview images and entries are synthetic (the sample drawings and the fridge are
  AI-generated). On sample Photos and Artwork the heart and comment change only the page, which says nothing was
  sent (#710, #714).
- Viewports 320/390/768/1280+, both themes, keyboard and screen reader.
- Closed sage fridge visible at all sizes, empty or not; no open-door animation.
- Confirm child selection, diary page controls, empty states, privacy placeholders, no parent creation affordances.
- Compare the rendered overview and galleries with the approved responsive previews above, and use the original collage for the diary and broader visual direction.
