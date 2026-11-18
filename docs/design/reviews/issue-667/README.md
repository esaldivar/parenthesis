# #667: Child Essentials What Helps redesign, implementation review (November 18, 2026)

Captures of the implemented What Helps section for comparison with the 52 approved Figma frames (page `878:194`,
"PARENT - CHILD ESSENTIALS - WHAT HELPS - CURRENT - APPROVED"). Synthetic Rivera Family only (Dad is the viewer, Mom
the co-parent, Kai the child), with our own example values, not the Figma sample content. Figma is the source of truth.

| File | What it shows |
|---|---|
| `implementation/01-saved-{desktop,mobile}-{light,dark}.png` | Saved values: label and value rows, Edit and History centered |
| `implementation/02-empty-*.png` | Nothing saved yet: Not set |
| `implementation/03-edit-*.png` | Edit in the state panel: 112px translucent fields, Save and Cancel |
| `implementation/04-updated-*.png` | Mom changed the comfort items: plain teal "Updated" beside (desktop) or under (phone) the label |
| `implementation/05-history-*.png` | History: who and when, previous and saved values in insets, Close history |
| `implementation/06-history-empty-*.png` | History with no changes yet |
| `implementation/09-validation-*.png` | Over 1,000 characters: the message and count, Save off |
| `implementation/10-save-failure-*.png` | A failed save: the existing message, the kept draft and Retry |
| `implementation/11-conflict-*.png` | Mom saved first: her latest values above Dad's kept draft, Save my draft |
| `implementation/12-load-failed-*.png` | What Helps couldn't be loaded, with Retry |

Desktop captures are 1440x1000 and phone captures 390x844, the Figma frame sizes. The Child Essentials update banner in
some captures is the existing #128 banner, which Figma doesn't draw. The `design approved` label and acceptance are the
owner's to apply.
