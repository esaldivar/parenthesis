# Parenthesis brand identity — v0.1

Status: concept approved in conversation, October 16, 2026. This document specifies the desired artwork; it does not claim that the generated concept image is a production-ready vector asset.

## Approved direction
- Product name: **Parenthesis** (one word).
- Primary logo: icon to the **left** of the wordmark on desktop; stacked arrangement may be used on mobile marketing/launch screens.
- Icon: two large, recognizable **parenthesis-shaped curves** framing a joyful child in the middle. The curves represent two parents embracing/supporting the child. The mark should read as both a hug and the punctuation characters `( )`.
- Parenthesis curves: one muted blue (`#4E79A7`), one sage green (`#5E8F7E`). They indicate two equal caregivers, **not** fixed gender, parent roles, or custody assignments. Do not assign blue to father and green to mother in product logic.
- Child: an abstract **coral** (`#F08A6B`) smiling figure, clearly inside the embrace, with **no realistic skin tone, ethnicity, hair, or gender cues**. The child must be visibly a child, not merely a dot.
- Optional small golden rays (`#F4C15D`) communicate joy. Omit rays at very small sizes if clarity suffers.
- Preferred icon concept: **Variation 1**, simple smiling child embraced by parentheses. Avoid heart or sprout embellishments in the default mark.
- Wordmark: **Option B** — `Parent` in sage green, `hesis` in charcoal (`#20303F`), same friendly rounded sans-serif font, weight and size. Keep capitalization exactly **Parenthesis**.
- Fallback: monochrome charcoal wordmark for compact/low-contrast contexts. Provide one-color logo versions and accessible contrast against both light and dark surfaces.

## Asset usage
- Full horizontal lockup for desktop headers and marketing.
- Stacked lockup for splash/onboarding contexts.
- Icon-only square for favicon, mobile app icon, and compact navigation.
- Keep comfortable clear space and avoid stretching, drop shadows, busy gradients, or skin-colored fills.
- Build and review actual vector artwork before declaring the final logo approved. A raster concept board is **visual reference only**, not an exportable production logo.

## Handoff / acceptance
The implementation should use reusable SVG assets and text, not approximate the logo with emoji, CSS punctuation, or a screenshot crop. Review 16px favicon, 24px navigation, 48px app icon, and full wordmark; check dark/light backgrounds, legibility, color-blind interpretation, and contrast. All faces/people remain abstract and inclusive.

See [../design-system.md](../design-system.md) for existing application UI guidance. Brand accent colors need not replace existing semantic action/contrast tokens.

## Implementation decisions (approved October 16, 2026)
- **Dark-mode wordmark:** `Parent` stays sage (`#5E8F7E`); `hesis` uses ivory (`#F7F5ED`) on dark surfaces, because charcoal is about 1.2:1 on the forest-green canvas. Light mode keeps charcoal.
- **UI action colour:** the design system's teal remains the colour for buttons and links (contrast-verified in both themes). Muted blue is used in the logo only and never encodes a parent, role or custody arrangement.
- Still open: final production artwork, a dark-mode README logo variant, and the rounded typeface.
