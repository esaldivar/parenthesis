# #403: Event photos and Family Memories, proposed design (October 31, 2026)

Static design boards for owner review, written before any implementation. They are not captures of the app and nothing
in them works: no upload, sharing or download happens. Synthetic Rivera Family only (Dad is the viewer, Mom the
co-parent, Kai the child); photo tiles are drawn shapes, not photos. Colors are the app's tokens from
`src/frontend/src/styles/_tokens.scss`. Rules and board list: [EVENT_PHOTOS_403.md](../../handoffs/EVENT_PHOTOS_403.md).

| File | What it shows |
|---|---|
| `boards.html` | Source of all boards; open it in a browser, add `?theme=dark` for the dark theme |
| `phone390-light.png`, `phone390-dark.png` | Every board at 390px |
| `phone320-light.png` | Every board at 320px (no horizontal scrolling) |
| `desktop1280-light.png`, `desktop1280-dark.png` | Every board at 1280px |

**Owner design review:** pending. Once approved, the implementation follows these boards using existing Angular
Material components; differences found during implementation will be listed in the implementation PR.
