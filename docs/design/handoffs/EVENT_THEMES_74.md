# Event illustration themes — issue #74

Branch: `design/74-event-themes`, based on `release/0.3.0`. Design only; no application implementation, merge or deployment.

## Owner-approved October 28, 2026

- [Party / birthday, light and dark](../assets/party-theme-approved-74.png): illustrated balloons at edges, category accents, readable details. Owner: “I love that. That's great.”
- [Meals and gatherings, light and dark](../assets/meals-theme-approved-74.png): simple food illustrations around the same layout. Owner: “It's perfect.”

Preserve these generated concept boards unchanged. Synthetic data only. They are visual references, not production components or accessibility verification. No substitute logo was created; follow BRANDING.md for final branding.

## Approved behavior

Per-user Settings toggle **Add themes to events**, default On. Off hides artwork on all event details for that user, including existing events, without affecting others. On selects artwork only from an obvious event title. Reevaluate after edits; unmatched or ambiguous titles have no artwork. No per-event selector, override, change or remove control.

Title selects illustration; existing event category supplies the translucent color wash. Artwork, never photographs. Keep details and statuses readable; decorate details, not the calendar grid. Family event palette from #255: light #FBE5DE / #743C30; dark #4A2E28 / #FFDCD1. Visual approval does not establish exact raster colors or final compositing values.

## Remaining

The owner approved the [remaining nine themes, light and dark](../assets/remaining-nine-themes-approved-74.png) on October 28, 2026 (“I love it. It's great”). This covers sports, holiday, vacation/travel, beach, camping, school, arts/music, outings and nature. Birthday reuses party; travel may reuse vacation. Follow #74's culturally inclusive neutral holiday-art policy without inferring family beliefs.

Specify matching rules and multiple matches, supported event types, settings placement/persistence/sync, asset licensing/storage, performance and offline behavior. Review desktop/settings examples, both themes, 320px, long titles, text enlargement, pending/declined states, keyboard/focus, final contrast and decorative-image screen-reader handling. These images do not verify runtime behavior.

Read issue #74 and latest comments before implementation. Individual concept approvals do not complete the issue. No merge or deployment without owner approval.

## Implementation ownership and next work

Eric assigned follow-on implementation to ChatGPT on October 28, 2026. All eleven motif directions are visually approved. The nine-theme sheet is preserved unchanged as approval evidence; its extra artwork colors do not supersede the category-color wash requirement. Derive reusable artwork assets rather than shipping entire mockup screenshots as application UI.

Next: inspect current app and settings architecture; specify deterministic title matching and ambiguous fallback, implement the default-On per-user toggle and title reevaluation, integrate reusable decorative assets with existing category tokens, and verify permissions, both themes, accessibility and responsive behavior. Preserve approved brand artwork. Track any remaining specification gaps explicitly. Implementation has not started; this PR remains design/documentation only. No merge or deployment authorized.

## Implementation candidate — October 28, 2026

Branch `feat/74-event-themes` implements the Settings toggle and account-isolated, device-local persistence following the existing appearance preference architecture. Cross-device synchronization is not implemented. Signed-out or new accounts default On. Title matching is deterministic and local, case insensitive with whole-word rules. Multiple motif matches and unknown titles remain plain; no event data is sent to an external service. Current matching vocabulary is English; unsupported titles remain plain.

Event details use a noninteractive, screen-reader-hidden decoration layer with category-token tint. Other-parent unavailable details never receive a motif. Edits and toggling reevaluate reactively. The calendar grid and authorization logic are unchanged. Approved boards remain reference evidence; the generated mask atlas is a new derivative requiring rendered visual review. No approval of exact final artwork is implied.

Validation: 638 frontend tests passed, lint passed, production build passed (existing dashboard stylesheet budget warning). Browser visual review, real screen-reader testing, cross-device preference synchronization and final artwork/contrast acceptance remain outstanding. No merge or deployment.
