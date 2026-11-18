# #664: Child Essentials Shared Caregivers redesign, implementation review (November 18, 2026)

Captures of the implemented Shared Caregivers section for comparison with the 36 approved Figma frames (page
`626:194`, "PARENT - CHILD ESSENTIALS - SHARED CAREGIVERS - CURRENT - APPROVED"). Synthetic Rivera Family only (Dad is
the viewer, Mom the co-parent, Kai and Lia the children), with our own example values. Figma is the source of truth.

| File | What it shows |
|---|---|
| `implementation/01-main-updated-{desktop,mobile}-{light,dark}.png` | A caregiver Mom added: bold name, stars and record-level Updated, role, rate and missing city, Call |
| `implementation/02-add-*.png` | The Add caregiver sheet: Name, Role, Phone, City, Hourly rate, Children, Notes (and School pickup) |
| `implementation/03-edit-*.png` | Edit caregiver, starting from the saved values |
| `implementation/04-validation-*.png` | Save with nothing filled in: "Enter a name and a valid phone number." |
| `implementation/05-unsaved-*.png` | Cancel with changes: "Discard your unsaved changes?" |
| `implementation/06-save-failed-*.png` | A failed save: the message, the kept draft and Retry |
| `implementation/07-remove-*.png` | Removal confirmed in the sheet (see the note on Archive below) |
| `implementation/08-empty-*.png` | No shared caregivers yet |

Desktop captures are 1440x1000 and phone captures 390x844, the Figma frame sizes. The update banner is the existing
#128 banner. Owner decisions recorded with this change (November 18, 2026): add Role, Notes and the Children choice.
The frames' "Archive caregiver … can be restored later" isn't shipped: caregivers are removed permanently today, so the
sheet keeps the truthful removal wording until a recoverable archive is decided (TODO.md). School pickup, an existing
field the frames don't draw, stays in the sheet so it isn't lost. The `design approved` label and acceptance are the
owner's to apply.
