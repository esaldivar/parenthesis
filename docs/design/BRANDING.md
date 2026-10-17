# Parenthesis brand identity — v0.1

Status: **BRAND DESIGN LOCKED — October 16, 2026.** The user supplied the original branding board and explicitly chose **Variation 1 (Default) + Option B wordmark**. This is a strict reference, not permission to reinterpret the mark. The exact original branding board is committed at [`assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg`](assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg). This is the immutable visual reference; production-ready logo exports remain pending.

## Immutable reference rules
- **Do not regenerate, redraw, restyle, recolor, substitute, or approximate the approved icon in any mockup or application screen.** Do not use AI-generated dashboard logos as source material.
- The original user-supplied branding board is the authoritative visual source: **Variation 1 (Default)** icon in the lower-left row and **Option B** wordmark in the upper middle. Any discrepancy between this text and the original artwork must be resolved in favor of the original artwork.
- Until visually verified production logo exports are checked into the repository, **do not promote the provisional SVG** at `docs/design/assets/parenthesis-logo-concept.svg` to an official logo. It is a placeholder only. Prefer an explicit asset-pending state to a visually incorrect substitute.
- Prepare horizontal, compact, and icon-only exports **from the same master artwork**, with no design variations. Review exports side by side against the source before approval.

## Approved direction
- Product name: **Parenthesis** (one word).
- Primary logo: icon to the **left** of the wordmark on desktop; stacked arrangement may be used on mobile marketing/launch screens.
- Icon: two large, recognizable **parenthesis-shaped curves** framing a joyful child in the middle. The curves represent two parents embracing/supporting the child. The mark should read as both a hug and the punctuation characters `( )`.
- Parenthesis curves: one muted blue (`#4E79A7`), one sage green (`#5E8F7E`). They indicate two equal caregivers, **not** fixed gender, parent roles, or custody assignments. Do not assign blue to father and green to mother in product logic.
- Child: an abstract **coral** (`#F08A6B`) smiling figure, clearly inside the embrace, with **no realistic skin tone, ethnicity, hair, or gender cues**. The child must be visibly a child, not merely a dot.
- The three golden rays (`#F4C15D`) in Variation 1 are part of the locked artwork. Do not independently remove or change them; any reduced-size rendering must be reviewed for legibility.
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
