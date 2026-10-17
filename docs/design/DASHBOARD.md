# Parent dashboard — weekly-first design specification

Status: **direction agreed in conversation on October 16, 2026**. Layout notes, not final approved visual mockups or permission to implement unfinished features.

## Purpose
A personalized, welcoming home screen that gives a parent a calm overview of the family week. Calendar is the visual centerpiece, with clear next actions and no competitive or adversarial tone.

## Information hierarchy
1. Warm personalized greeting and current date; avoid revealing sensitive details on unauthenticated views.
2. **This week** calendar as the default dashboard view, with visible day/date labels, today's emphasis, confirmed parenting-time blocks, and upcoming family events.
3. Next exchange/handoff summary (time, date, child where authorized); do not invent locations or arrangements.
4. **Needs your review**: pending event or parenting-time proposals, with count and direct route to details. Never present pending proposals as confirmed.
5. Upcoming events and recent shared family memories.
6. Messages: only when implemented; until then, avoid a fake working inbox.

## Multi-child schedule grouping — agreed behavior
- A family may have one or many children. The **default** is one shared calendar block when multiple children have the same parent/caregiver assignment and identical start/end times.
- The shared block shows each child's avatar side by side, plus names (for example, **Kai & Aurora**) and an explicit caregiver label (for example, **With Jordan**). Never rely on color alone or imply the children are parents.
- If the children have different parenting-time assignments or time windows, show distinct blocks for the affected children. Expand a group to inspect individual child details.
- Offer an optional **split display for this week** so a parent can see separate child blocks even if schedules match. This is a **view preference only**: splitting or regrouping must not modify custody assignments, approvals, or underlying events. Make it reversible.
- Grouping should scale to larger families: show a limited row of avatars and an accessible **+N children** label when space is tight; reveal the full child list on expansion.
- Use **Kai and Aurora** as example child names in the reviewed concept, but use synthetic profiles and images in actual fixtures/mockups, not real children's photos or personal data.
- Any actual proposed change to one child's parenting time still follows the existing mutual-approval and authorization rules.

## Calendar behavior
- **Weekly by default on dashboard**, not monthly.
- Provide a clearly labelled **View month** action that opens the full calendar's monthly view in one interaction.
- Keep the current week obvious; previous/next week controls accessible by keyboard and touch.
- Confirmed events remain visible if a modification is pending. Show distinct textual statuses such as **Confirmed**, **Proposed**, **Change pending**, **Rejected**; never rely on color alone.
- A visible **Propose an event** action should eventually open the authorized proposal flow. In Milestone 1, do not show a fake successful proposal flow: link to a real implemented screen or use an honest unavailable state.
- Equal parent authority; proposals follow existing approval rules and server authorization.

## Responsive layout
**Desktop:** Left navigation; main wide weekly calendar panel; narrower secondary column or cards for next handoff and needs-review items. Upcoming events and memories beneath, with ample whitespace and warm rounded cards.

**Mobile:** Greeting, compact accessible weekly strip or week agenda, next handoff, needs-review, upcoming events, memories in a single vertical scroll. Keep **View month** and **Propose an event** discoverable. Bottom navigation follows the established parent shell. No horizontal page overflow at 320px.

## Visual and interaction requirements
- Follow [existing semantic tokens](../design-system.md) and [brand identity](BRANDING.md), including light/dark/system modes. Do not replace contrast-safe action tokens with decorative logo colors.
- Use existing Angular Material/CDK patterns and accessible controls; no new framework.
- Loading, empty, error, no-upcoming-event, and no-pending-approval states must be honest and reassuring.
- Provide accessible names, visible focus, screen-reader status labels, 44px practical touch targets, text reflow, and reduced-motion behavior.
- No invented real child/family information in mockups; use synthetic examples.

## Acceptance for later implementation
- Dashboard opens to current week, and **View month** opens the monthly calendar in one action.
- Confirmed vs proposed changes are unmistakable visually and textually.
- Next handoff and outstanding decisions are easy to find on desktop and mobile.
- Cards and navigation adapt to 320px without horizontal scrolling.
- Permissions and privacy are enforced by the server, not only by hidden UI.
- Unimplemented features do not simulate success.

## Desktop and mobile wireframe handoff

These are layout wireframes, not final rendered visual assets. The approved branding board is committed on `feat/angular-shell` at `docs/design/assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg`. Use that exact source for any logo placement; never recreate it with an image generator. Production logo exports are still pending.

### Desktop layout (wide viewport)

```text
[APPROVED BRAND]   Home / Calendar / Memories / Settings
[Hello, Jordan]                     [View month] [Propose an event]
+------------------------------------------+-----------------------+
| THIS WEEK  < Oct 12–18 >                 | NEXT HANDOFF          |
| Sun  Mon  Tue  Wed  Thu  Fri  Sat         | Kai + Aurora         |
| [Kai][Aurora] Kai & Aurora — With Jordan  | Confirmed • details   |
| [Kai][Aurora] Kai & Aurora — With Alex    +-----------------------+
| Proposed changes appear separately       | NEEDS YOUR REVIEW     |
| [Expand] [Split children this week]       | 1 proposed event      |
+------------------------------------------+-----------------------+
| UPCOMING EVENTS                          | SHARED MEMORIES       |
+------------------------------------------+-----------------------+
```

### Mobile layout (320px and wider)

```text
[APPROVED BRAND]                   [Profile]
Hello, Jordan
THIS WEEK     < Oct 12–18 >    [View month]
[Sun][Mon][Tue][Wed][Thu][Fri][Sat]
[Kai][Aurora] Kai & Aurora
With Jordan • Confirmed
[Propose an event]
NEXT HANDOFF — Kai & Aurora
NEEDS YOUR REVIEW — 1 proposal
UPCOMING EVENTS
SHARED MEMORIES
[Home] [Calendar] [Memories] [Settings]
```

**Visual review checklist:** approved logo exactly as supplied; warm cream surfaces, sage and muted-blue accents, restrained coral highlights, rounded cards, readable typography; confirmed and proposed status labels; names beside adjacent child icons; both parent names explicitly labelled; no functional-looking messaging until built. Any mockup screenshots require explicit user review before implementation.

## Implementation decisions (approved October 16, 2026)
- **Weeks run Sunday to Saturday** on the dashboard and calendar (the wireframes above were updated from Mon–Sun).
- Children's names in a shared block are listed **alphabetically** (for example, "Aurora & Kai").
- **Show children separately this week** is a view-only toggle that **resets when the displayed week changes**.
- Until verified production logo exports are committed, the app shows a **text-only "Parenthesis" wordmark** (Option B colours) as an explicit logo-pending state, and no custom favicon.
- Development builds may preview the dashboard with clearly labelled **synthetic sample data** via `?sample=1`; production builds never show it.
