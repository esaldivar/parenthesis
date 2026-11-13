# #354: Address suggestions on the Location field (October 29, 2026)

Headless Chromium captures of `feat/354-place-suggestions` against a local API and PostgreSQL. The suggestion
request was answered in the browser with synthetic addresses (Google isn't called in captures or tests).

`place-suggestions.png`: typing "100 Example" on Add event at 390px and 1280px, light and dark, then the picked
suggestion filling the field. The list is Angular Material's autocomplete (the existing design system), with up to three
suggestions and Google's "Google Maps" text attribution at its foot. Screen readers hear the attribution in the
field's hint. **Owner approval (October 29, 2026, in the Claude app):** approved with at most **three** suggestions (the board,
captured before that change, shows three sample suggestions). No embedded maps anywhere. The "Google Maps" text
attribution stays for the development site; the owner checks it against Google's current rule before production.
