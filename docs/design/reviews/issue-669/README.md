# Issue #669: warm Child Essentials landing page

Approved Figma frames (file `hmhenJVt2yFA6DQKfMdkMb`), all four inspected with the Figma connector before coding:

| Layout | Light | Dark |
|---|---|---|
| Desktop | `1321:2` | `1321:56` |
| Mobile | `1321:110` | `1321:168` |

`implementation/` holds app-only captures at 2x (synthetic family: Kai and Aurora): the landing at 1440 and 1920 wide
and on 390 and 320px phones, in both themes, plus the card grid alone at 1920.

## Comparison with the frames

- **Cards:** the frames' fills, outlines and text colors per category and theme (School blue, Allergies yellow, Routines
  sage, Clothing lavender, What Helps peach, Caregivers mint, Emergency pink, Medical green), 16px corners. Desktop:
  128px tall, 112x80 art first, a 224px text block, then the chevron; two columns 14px apart, each at most 470px.
  Phones: 112px tall, text, then the 88x68 art, then the chevron; one column 12px apart.
- **Artwork:** the eight embedded cleaned illustrations (identical in all four frames), full color in both themes,
  transparent, uncropped and placed with `object-fit: contain` as in the frames.
- **Type:** titles 22/27.5 (20/25 on phones) bold and descriptions 14/18.9 in the frames' system font (Segoe UI on
  Windows); "Kai's essentials" Inter Semi Bold 24/32 (20/28 on phones).
- **Chevrons:** the page text color, except Allergies & Food's, which uses its own brown, as drawn.
- **Children:** the name alone, Inter Semi Bold 16, centered on both axes; 210x60 beside the cards (side by side, 52px,
  on phones); highlighted when chosen (`#d4e3c9` / `#214a3b`), outlined otherwise; no checkmark. `aria-pressed` carries
  the choice, and Windows High Contrast adds a Highlight outline.

## Differences, on purpose

- The frames omit the app's sidebar, top bar and phone navigation; the real shell stays. With the sidebar, two columns
  need the existing 46rem content width, so at 1280-1439px the desktop cards sit in one column.
- The update dot stays: on a card before the chevron, and on a child at the end of the choice so the name stays centered.
- The section screens keep their approved designs, including the avatar in the child list.
