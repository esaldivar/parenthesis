# #209: Light-mode visibility (October 30, 2026)

Headless Chromium captures of the development build with a synthetic family (Alex and Sam, children Mia and Leo),
served with a mock API. Each image is **before on the left, after on the right**.

- `calendar-week-desktop-light.png`, `calendar-month-phone-light.png`, `home-phone-light.png`: light mode at 1280px,
  390px and 390px.
- `calendar-week-desktop-dark.png`: dark mode, to show it's visually unchanged.

## What changed and why

Text contrast already passed. What was hard to see were the edges:

| Light-mode edge | Before | After |
|---|---|---|
| Calendar item edge | grey outline at 45%, about 1.7:1 on white | category text color mixed 60% into the fill, 3.2:1 or more on white |
| Grid, hour, month-cell and card hairlines | `#E4EBDD`, 1.22:1 on white, 1.12:1 on the canvas | `--color-divider` `#CFD7C9`, 1.48:1 on white, 1.35:1 on the canvas |
| Selected nav item and segments | `#E4EBDD`, 1.12:1 on the canvas | `#D6E4D0`; text on it 9.3:1, teal action 4.8:1 |

The approved calendar boards (`docs/design/assets/calendar/`) use the same kind of tinted edges (a blue block has a
blue edge, a green block a green one). Dark mode keeps its values: the divider equals the old `surface-soft`, and the
tinted edge at 45% is about 3.1:1 or more on the dark surface. Canvas, surfaces, the #255 calendar palette, brand
colors and layouts are unchanged.

**Owner approval (October 30, 2026, in the Claude app):** "Approve as proposed", without dimming the canvas.
