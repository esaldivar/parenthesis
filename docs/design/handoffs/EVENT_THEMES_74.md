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

Review sports, holiday, vacation/travel, beach, camping, school, arts/music, outings and nature. Birthday reuses party; travel may reuse vacation. Follow #74's culturally inclusive neutral holiday-art policy without inferring family beliefs.

Specify matching rules and multiple matches, supported event types, settings placement/persistence/sync, asset licensing/storage, performance and offline behavior. Review desktop/settings examples, both themes, 320px, long titles, text enlargement, pending/declined states, keyboard/focus, final contrast and decorative-image screen-reader handling. These images do not verify runtime behavior.

Read issue #74 and latest comments before implementation. Individual concept approvals do not complete the issue. No merge or deployment without owner approval.
