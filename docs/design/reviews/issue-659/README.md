# #659: Child Essentials Medical redesign, implementation review (November 17, 2026)

Captures of the implemented Medical screen and the combined Medical reference PDF, for comparison with the approved
Figma page `174:2` in "Parenthesis - Design System" (41 frames: 40 screen states plus the PDF layout `221:2`). Synthetic
data only (Dad is the viewer, Mom the co-parent, Kai and Avery the children; providers and medications are invented).
Figma is the source of truth. Side-by-side comparisons with the Figma frames stay in the owner's project files and are
not committed, because the frames show the owner's own example data.

| File | What it shows |
|---|---|
| `implementation/NN-<state>-{desktop,mobile}-{light,dark}.png` | Each approved state at 1440px and 390px in both themes: 01 provider updated with empty medication, 02 edit provider, 03 add provider, 04 provider history, 05 remove provider, 06 add medication, 07 medication history, 08 populated medication, 09 edit medication, 10 PDF options. Full-page captures, so the phone's fixed navigation and artwork appear part-way down |
| `implementation/01-*-mobile-*-screen.png` | The phone screen as seen: artwork centred between the top bar and the navigation |
| `pdf/1-empty-medication-1.png` | One child, providers and no medications (the approved empty layout) |
| `pdf/2-populated-*.png`, `pdf/3-populated-current-only-1.png` | Current and discontinued medications; current only |
| `pdf/4-all-children-*.png` | All children: each child starts a new page, with real page numbers |
| `pdf/5-populated-spanish-*.png` | Spanish (es-419) labels |
| `pdf/6-long-multipage-*.png` | Long instructions across six pages, the child's band repeated on each continuation page |

The `design approved` label and acceptance are the owner's to apply.
