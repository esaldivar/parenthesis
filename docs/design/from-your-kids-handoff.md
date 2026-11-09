# From Your Kids — M4 parent-facing handoff (#531)

Status: **implementation in progress**. Source branch: `feature/531-from-your-kids-m4` from `release/0.4.0`.

## Design references
- Approved conversation mockups: overview, diary, fridge and corkboard in desktop/mobile and light/dark.
- **Owner-uploaded, authoritative visual asset:** [Parenthesis From Your Kids UI Collage.png](assets/Parenthesis%20From%20Your%20Kids%20UI%20Collage.png). This is the reference for implementation and handoff. Do not redraw, substitute or invent replacement assets. Keep the original PNG unchanged.
- The collage includes multiple responsive/theme states. Any individual production art assets must be extracted or separately approved; do not use the collage as an in-app image or pretend it is a sprite sheet.
- The shipped WebP crops in `src/frontend/public/art/from-your-kids` retain the original drawings. The collage supplies the closed fridge variants and diary sun. *Emma’s Heartfelt Photo Adventures* supplies the overview icons, leaves, wood, cork, stickers and synthetic preview photos. *Artwork Fridge Experience* supplies individual drawings. *Emma’s Cozy Diary* supplies the binding and heart.
- The full UI Board, Photos Mockup and Kids’ Illustrated Diary UI guide section navigation, the photo layout, and the single-page mobile journal. Where the concepts differ, the final collage and the closed-fridge and forest-green decisions govern. No complete mockup is shipped as an app screen.
- Follow [BRANDING.md](BRANDING.md) strictly: preserve existing logo artwork; light charcoal #20303F, dark ivory #F7F5ED, sage #5E8F7E, blue #4E79A7, coral #F08A6B, golden rays #F4C15D. UI uses existing design-system tokens, not the purple palette from the AI concepts.

## Product behavior
1. Parent selects child, then Diary / Artwork / Photos.
2. Diary: latest first, desktop facing pages, mobile single page, turn arrows/swipe; mood character and entry content, **no reactions/comments**. Entries are visible only to selected parents.
3. Artwork: refrigerator stays **CLOSED**; pictures are magnetically attached **on its exterior**. On desktop, hovering a drawing tilts and enlarges it briefly, then it settles when the pointer leaves. Reduced motion keeps the drawing still. Open artwork details on tap/click; parent heart, short one-way comment, bookmark, download, explicit Google Photos export.
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
- Review the implementation directly against the owner-uploaded collage linked above. The extracted art uses the approved source images. New or replacement artwork still requires approval.
