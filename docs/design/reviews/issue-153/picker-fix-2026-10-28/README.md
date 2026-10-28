# #153 picker fix — owner-approved mock-ups (October 28, 2026)

Headless Chromium captures of PR #345 (`feat/153-picker-after-setup`), driven through the real Angular app against a
local API and PostgreSQL. Synthetic data only (Dad, Kai, Rivera Family). They show the owner's fix after testing on
`develop`, where parents couldn't find "Who's using Parenthesis?".

**Owner approval (October 28, 2026, in the Claude app):** the boards below were approved as built, reusing existing
components:

- The header's **Switch profile** button keeps its label on every screen size; on phones the header wraps to two rows.
- **Switch profile** stays in the account menu too, next to Sign out.
- **Stop sharing this device** uses the neutral outline button with a filled confirm, like other device actions (not
  the red Delete account style).

| File | What it shows |
|---|---|
| `1-phone-flow-light.png`, `1-phone-flow-dark.png` | 390px: picker right after setup, header button, account menu, Settings "(this device)", Stop sharing confirmation, sign-in afterwards |
| `2-header-options-phone.png` | 390px: labelled button (chosen) beside the icon-only alternative (not chosen) |
| `3-desktop-light.png`, `3-desktop-dark.png` | 1280px: header button and the Stop sharing confirmation |

The header keeps the unchanged approved icon with the text wordmark (exact wordmark exports are still pending).
