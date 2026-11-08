# From Your Kids — M4 parent-facing handoff (#531)

Status: **implementation in progress**. Source branch: `feature/531-from-your-kids-m4` from `release/0.4.0`.

## Design references
- Approved conversation mockups: overview, diary, fridge and corkboard in desktop/mobile and light/dark.
- [Closed-fridge illustration](assets/from-your-kids/closed-fridge.svg) is a **new implementation-ready SVG illustration**, not the original AI mockup PNG.
- Original generated composite PNGs remain in the design conversation and **are not yet checked into GitHub**. They must be exported/uploaded separately before declaring the image handoff complete.
- Follow [BRANDING.md](BRANDING.md) strictly: preserve existing logo artwork; light charcoal #20303F, dark ivory #F7F5ED, sage #5E8F7E, blue #4E79A7, coral #F08A6B, golden rays #F4C15D. UI uses existing design-system tokens, not the purple palette from the AI concepts.

## Product behavior
1. Parent selects child, then Diary / Artwork / Photos.
2. Diary: latest first, desktop facing pages, mobile single page, turn arrows/swipe; mood character and entry content, **no reactions/comments**. Entries are visible only to selected parents.
3. Artwork: refrigerator stays **CLOSED**; pictures are magnetically attached **on its exterior**. Open artwork details on tap/click; parent heart, short one-way comment, bookmark, download, explicit Google Photos export.
4. Photos: corkboard with child's name and pinned photos; same one-way reactions, bookmarking and explicit export.
5. Bookmark preserves artwork/photos; hearts do not. Unsaved items expire after 60 days, enforced by M5 service. Diary retained separately.
6. Parent never uploads or creates content in these views. Never automatically export. No child replies to comments.

## M4/M5 boundary
M4 owns parent-facing layout, accessible state machine and content contracts. M5 owns child authoring, consent, parent-specific sharing, real storage, retention, and API integration. **Do not display synthetic child content as if real**: only show fixtures behind a clearly labeled development preview. Default to honest empty state until the API is ready.

## QA
- Viewports 320/390/768/1280+, both themes, keyboard and screen reader.
- Closed fridge visible at all sizes; no open-door animation.
- Confirm child selection, diary page controls, empty states, privacy placeholders, no parent creation affordances.
- Review the original mockup PNGs against the implementation once exported to this directory.
