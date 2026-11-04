# #404: Google Photos export, proposed design (November 4, 2026)

Static design boards for owner review, written before any implementation. They are not captures of the app and nothing
in them works: nothing connects to Google or exports. Synthetic Rivera Family only (Dad is the viewer, Mom the
co-parent, Kai the child); photo tiles are drawn shapes, not photos. Styles and tokens are copied from the approved
[#403 boards](../issue-403/README.md). Rules and board list:
[GOOGLE_PHOTOS_EXPORT_404.md](../../handoffs/GOOGLE_PHOTOS_EXPORT_404.md).

| File | What it shows |
|---|---|
| `boards.html` | Source of all boards; open it in a browser, add `?theme=dark` for the dark theme |
| `phone390-light.png`, `phone390-dark.png` | Every board at 390px |
| `phone320-light.png` | Every board at 320px (no horizontal scrolling) |
| `desktop1280-light.png`, `desktop1280-dark.png` | Every board at 1280px |

**Owner design review (November 4, 2026, in the Claude app):** approved as shown, with both open questions decided
as proposed (no re-export in M3; `appendonly` scope only). Differences found during implementation will be listed in
the implementation PR.
The `design approved` label is the owner's to apply.
