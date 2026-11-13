# Browser icon exports (#579)

All browser icons are direct raster exports of `parenthesis-icon.svg` (source blob `ca19a3be3cec218bf75ecb10cdc666788a22b983`). Preserve the approved geometry, colors, transparency and aspect ratio; do not redraw or recolor the mark.

| File | Size | Use |
| --- | --- | --- |
| `favicon-16x16.png` | 16 × 16 | Standard browser tab fallback |
| `favicon-32x32.png` | 32 × 32 | Higher-density browser tab fallback |
| `apple-touch-icon.png` | 180 × 180 | Apple touch/bookmark icon |
| `../favicon.ico` | 16, 32 and 48 pixel frames | Root fallback for browsers/bookmarks requesting `/favicon.ico` |

PNG exports use antialiased SVG path rasterization on square transparent canvases, fitting the complete 188 × 174 SVG viewBox and centering it without stretching or cropping. The ICO contains those PNG renderings at its three resolutions. Keep the SVG declaration for browsers that support it and the PNG declarations for older Safari. No web manifest is needed for this favicon fix.

After deployment, verify the tab icon in the affected Safari version and an SVG-capable browser, and check that each declared URL returns its image rather than the SPA shell. If Safari retains the old letter tile, quit/reopen Safari and retry with its website/favicon cache cleared through the browser's normal controls. A cache reset does not establish that the deployed assets are correct; inspect the responses first.
