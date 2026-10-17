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

## Next design review
Create desktop and mobile mockups from this specification, then request approval before treating specific dimensions, copy, and interactions as final.
