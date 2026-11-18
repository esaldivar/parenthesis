# Desktop sidebar repair (#676)

The desktop shell is bounded to the dynamic viewport. Its sidebar spans both grid rows and stays stationary;
only the main content pane scrolls. The existing leaves and localized tagline remain present on short windows,
with compact navigation/footer spacing instead of hiding the artwork or adding a sidebar scrollbar.

Switching sections resets the main pane to its top. Mobile shell rules are unchanged.

## Local evidence

The committed screenshots render the production Angular build with intercepted synthetic authentication/family
responses. Child Essentials shows its honest empty state; a temporary tall DOM fixture was used to exercise
scrolling and removed before screenshots. These checks do not certify backend integration or live deployment.

Chromium checks passed at 1024/1280px widths and 900, 768, 600 and 480px heights in English/Spanish and light/dark:
sidebar top stays at zero and bottom matches the viewport, main scrollTop advances, window scroll stays at zero,
Settings and the footer remain in view, and the sidebar has no independent scroll container.
At 320/390px widths, the sidebar remains hidden, bottom navigation is visible, and document scrolling still works
without horizontal overflow. This is 32 desktop and 8 mobile synthetic browser checks.

Screenshots in `implementation/` include English light/dark at 768/480px and Spanish light/dark at 480px.
The existing navigation Playwright journey now covers the viewport/scroll assertions against the real test app;
the full Release E2E gate and owner acceptance remain required.

## Release-gate follow-up

The desktop Calendar regression now scrolls the main pane. The first full rerun revealed a small remaining
overlap between the last list item and the sticky legend. Calendar's end clearance now includes a 16px gap;
local production-build checks with synthetic events at 1440x900 and 1024x600 in both themes measured an 11.77px
gap and verified the last item was clickable. Toast entrance keeps full opacity to preserve text contrast during
its slide animation. Whole-page accessibility scans now scroll the actual main pane on desktop and continue to
use the document on mobile, without exclusions or disabled rules.
