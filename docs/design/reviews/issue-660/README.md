# #660: Child Essentials Clothing & Shoes redesign, implementation review (November 17, 2026)

Captures of the implemented Clothing & Shoes section for comparison with the 32 approved Figma frames (page `279:2`,
"PARENT - CHILD ESSENTIALS - CLOTHING & SHOES - CURRENT - APPROVED", in "Parenthesis - Design System"). Synthetic
Rivera Family only (Dad is the viewer, Mom the co-parent, Kai the child). The values are our own synthetic examples,
not the Figma sample content. Figma is the source of truth. The side-by-side comparisons with the Figma frames stay in
the owner's project files and are not committed, because the frames show the owner's own example data.

| File | What it shows |
|---|---|
| `implementation/01-detail-{desktop,mobile}-{light,dark}.png` | Detail with nothing saved (Not set) |
| `implementation/02-edit-*.png` | Edit: translucent fields, Clothing notes (optional) and its helper text, filled Save |
| `implementation/03-history-empty-*.png` | History open with no changes yet |
| `implementation/04-updated-*.png` | Mom changed the shoe size: plain teal "Updated" beside (desktop) or under (phone) the label |
| `implementation/05-populated-*.png` | Every field filled, multiline Clothing notes stacked under the label |
| `implementation/06-history-populated-*.png` | History with who and when, previous and saved values (`-full` is the whole page) |
| `implementation/07-save-failure-*.png` | A failed save: the existing message and the kept draft |
| `implementation/08-conflict-*.png` | Mom saved first: latest saved values above Dad's kept draft, Save my draft (`-full` is the whole page) |
| `implementation/spanish-{detail,edit}-320-{light,dark}.png` | Spanish (es-419) at 320px with long values |

Desktop captures are 1440x1000 and phone captures 390x844, the Figma frame sizes. The Child Essentials update banner
("Kai's shoe size updated") in some captures is the existing #128 banner, which Figma doesn't draw.

The `design approved` label and acceptance are the owner's to apply.
