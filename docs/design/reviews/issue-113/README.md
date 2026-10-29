# #113 — "Open in Google Maps" in event details (October 29, 2026)

Headless Chromium captures of the implementation branch `feat/113-open-location-in-maps`, driven through the real
Angular app against a local API and PostgreSQL. Synthetic data only (Dad, Kai, a made-up address).

`maps-link.png` shows event details at 390px and 1280px in light and dark themes. Under **Where**, the saved location
stays as written, followed by one text link: an outline "leaves the app" icon and **Open in Google Maps**. Screen
readers hear "Open in Google Maps (opens in a new tab)".

It reuses the existing link colour (`--color-action`), type and spacing; the only new asset is the outline
`external` icon in `shared/icon/icon.ts`. No map is shown in Parenthesis. **Owner approval (October 29, 2026, in the Claude app):** approved as built.
