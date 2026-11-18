# #662: Child Essentials Allergies & Food redesign, implementation review (November 18, 2026)

Captures of the implemented Allergies & Food section for comparison with the 37 approved Figma frames (page `331:2`,
"PARENT - CHILD ESSENTIALS - ALLERGIES & FOOD - CURRENT - APPROVED", 36 screen states plus the print frame `332:2`,
in "Parenthesis - Design System"). Synthetic Rivera Family only (Dad is the viewer, Mom the co-parent, Kai and Lia the
children). The values are our own synthetic examples, not the Figma sample content, and the "ILLUSTRATIVE STATE"
review lines in the frames are not product UI. Figma is the source of truth.

| File | What it shows |
|---|---|
| `implementation/01-detail-{desktop,mobile}-{light,dark}.png` | Detail: each row a label over its value |
| `implementation/02-edit-*.png` | Edit: translucent 100px fields, the No known allergies checkbox and its hint, filled Save |
| `implementation/03-history-*.png` | History: who and when, previous and saved values |
| `implementation/04-updated-*.png` | Mom changed the allergies: plain teal "Updated" beside (desktop) or under (phone) the label |
| `implementation/05-no-known-*.png` | An explicit No known allergies (nothing recorded reads "No allergies listed") |
| `implementation/06-no-known-edit-*.png` | Editing with No known allergies checked |
| `implementation/07-pdf-options-*.png` | PDF options: child choice and a full-width Download PDF |
| `implementation/08-save-failure-*.png` | A failed save: the existing message and the kept draft |
| `implementation/09-conflict-*.png` | Mom saved first: latest saved values above Dad's kept draft, Save my draft |

Desktop captures are 1440x1000 and phone captures 390x844, the Figma frame sizes. The Child Essentials update banner
("Kai's Allergies & Food updated") in some captures is the existing #128 banner, which Figma doesn't draw.

The `design approved` label and acceptance are the owner's to apply.
