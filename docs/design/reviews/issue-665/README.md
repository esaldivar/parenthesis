# #665: Child Essentials Emergency Contacts redesign, implementation review (November 18, 2026)

Captures of the implemented Emergency Contacts section for comparison with the 64 approved Figma frames (page
`715:194`, "PARENT - CHILD ESSENTIALS - EMERGENCY CONTACTS - CURRENT - APPROVED"). Synthetic Rivera Family only (Dad is
the viewer, Mom the co-parent, Kai and Lia the children), with our own example values. Figma is the source of truth.

| File | What it shows |
|---|---|
| `implementation/01-main-updated-{desktop,mobile}-{light,dark}.png` | Two-row cards: Call first pinned, Updated, Call and Open in Maps (only with an address), Edit/Remove, Copy to |
| `implementation/02-add-*.png` | Add emergency contact in the state panel, with Call first for Kai and its explanation |
| `implementation/03-edit-*.png` | Edit, starting from the saved values |
| `implementation/05-duplicate-*.png` | Another person with a number already on Kai's list: the warning and Review contact |
| `implementation/06-copy-*.png` | Copy confirmation: the child choice and that Lia's Call first stays her own |
| `implementation/07-copied-*.png` | Emergency contact copied |
| `implementation/08-remove-*.png` | Remove confirmation |
| `implementation/10-empty-*.png` | No emergency contacts yet |

Desktop captures are 1440x1000 and phone captures 390x844. The pink banner is the existing #128 update banner, which
Figma doesn't draw. Design-state names from the frames (e.g. "Remove confirmation") aren't shipped as titles. The
`design approved` label and acceptance are the owner's to apply.
