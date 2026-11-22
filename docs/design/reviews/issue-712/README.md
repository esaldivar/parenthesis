# From Your Kids Diary — approved design implementation (#712)

Source: [Figma draft page](https://www.figma.com/design/hmhenJVt2yFA6DQKfMdkMb?node-id=1649-2), newest frames 1791:2 / 1791:105 / 1791:208 / 1791:276 and older frames 1793:2 / 1793:113 / 1793:224 / 1793:303. Owner approved November 22, 2026.

The parent Diary is read-only. Desktop shows two newest-first entries per spread, separately scrollable paper regions, brass symbols on the paper and an optional page-turn effect. Mobile scrolls separate sheets, alternating left/right book sides, with a conditional brass return arrow. Only entry titles use the locally bundled Caveat Bold font at 33px. Dates are localized and omit the time. The Messages dock retains its existing higher stacking layer.

## Exact approved assets

The four PNGs in `public/art/from-your-kids/diary-*.png` come from the approved Figma asset preparation in this design session, not from flattened UI screenshots:

- `diary-blank.png`: clean blank open journal, Figma image hash `e96fbef0abfd51ba57bbcc9cf10ba0e5c5778c09`.
- `diary-title-clean.png`: title ribbon, hash `55a159c8d235bd1649ec60d99dbc55477a42e62c`.
- `diary-leaves-clean.png`: complete transparent sprig, hash `307669abf7507397acefd57fe9bdc6af963ffe88`.
- `diary-icon-clean.png`: blank-page diary icon, hash `12f23226fbcc59b64b335ff2464a4b0abce824fd`.

The mobile left/right pages use opposite halves of the same blank journal artwork. Writing is live text and is never mirrored. The font package is `@fontsource/caveat`, bundled locally under its included OFL license; no third-party font request is made.

## Verification and boundaries

The screenshots use synthetic identities and the existing development-only sample-content toggle. `visual-results.json` records the local Chromium matrix (1440/390/320, English/Spanish, light/dark), with paging/scroll/focus checks and scoped axe scans. These are presentation checks with mocked account/child API responses, not live authorization or physical-device acceptance.

Local validation: 1,109 frontend tests passed across 101 files after integrating the merged Photos PR; lint and the production build passed. The build reports the initial bundle and Calendar stylesheet budget warnings. A Calendar test failed in the first full run, passed in isolation, and then the complete suite passed. The browser matrix has 12 passing combinations and zero scoped axe violations; it also checks long-entry scrolling with the keyboard, mobile return focus, and the normal-motion page turn versus reduced motion.

To reproduce the browser audit, build the frontend with `ng build --configuration development --output-path dist/diary-preview`, install the `tests/e2e` dependencies/browser, then run `node tests/e2e/scripts/diary-design-preview.mjs` from the repository root. Set `E2E_CHROMIUM_PATH` only when using an already installed compatible Chromium. It serves the local preview on a loopback port and mocks every account/child API response; it never signs into the Development site.

The default remains an honest empty diary. The existing application does not yet connect a parent Diary reader to live shared-entry storage; this PR does not invent child content or change the backend sharing/authorization contract. Artwork remains pending design, and Photos is handled separately by #710 / PR #711.

After deployment, owner review, real assistive-technology acceptance, and full integrated release checks remain separate. The mobile and desktop newest/older behavior is covered by unit tests; reduced-motion CSS disables page-turn transforms entirely.
