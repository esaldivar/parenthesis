# Approved dashboard visual specification — October 16, 2026

**Status: USER-APPROVED VISUAL DESIGN.** This document supersedes older dashboard wireframes where they conflict. Implement only within the planned feature scope; a mockup is not proof of a working feature.

## Reference
The user explicitly approved the final wide Parenthesis dashboard image produced in the October 16 design conversation: ivory/cream and sage-green interface, official family-embrace logo, left sidebar, large weekly calendar, right Upcoming and Quick Add cards, lower From Your Kids, Recent Messages and Family Memories cards. The approved image is a **visual reference**, not a production asset; obtain and commit the exact approved image as `docs/design/assets/approved-dashboard-2026-10-16.png` before claiming pixel-level fidelity. Do not invent a different screenshot or infer it is already in GitHub. Original authoritative logo artwork remains `docs/design/assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg`; see `BRANDING.md`.

## Immutable visual direction
- Preserve layout, proportions, card hierarchy, rounded corners, gentle organic leaves, warm illustrated family content, avatar placement, typography feel, icons, and overall polished warmth of the approved dashboard. No unsolicited redesign.
- Semantic colors from `docs/design-system.md`: canvas ivory #F7F5ED, white #FFFFFF surfaces, sage #E4EBDD soft surfaces, forest #203A31 primary text, teal #176B67 actions, restrained coral #DE8F7E. Logo uses its separate locked colors from `BRANDING.md`. Use accessible contrast; do not substitute purple/blue as the main UI palette.
- Exact approved logo: Variation 1 Default icon + Option B wordmark. Do not redraw or generate it. Production exports pending visual verification.
- Use consistent recognizable line icons (calendar, message bubble, child artwork/pencil for From Your Kids, photo album for Family Memories, family/people for Child Essentials, proper gear for Settings), with accessible labels.

## Desktop navigation — exact order
1. Home
2. Calendar — **single standalone item, no chevron/dropdown, no nested Events**
3. Messages
4. From Your Kids
5. Family Memories
6. Child Essentials — **top-level, directly below Family Memories and above Settings**, NOT nested under Calendar
7. Settings

Do not revert these decisions based on older notes.

## Weekly calendar centerpiece
- Weekly view by default, with previous/next week, Today, and Week/Month/List view controls. Current day indicated clearly.
- Show **one continuous all-day event spanning the relevant date columns**, not seven disconnected single-day cards, for a multi-day parenting-time assignment. Example label **“Time with Dad”** over Sunday–Saturday. Do not label it “custody.”
- **Inside the multi-day event itself**, show circular **Dad avatar + Kai avatar + Aurora avatar**, directly adjacent to/beneath the event label. It must be instantly clear which parent is responsible and which children are included. The event needs enough height to show these avatars legibly. If Mom has the children, use Mom's avatar and relevant children's avatars. For a joint event show both parents as appropriate. For a single-child event show only that child. Never rely on color alone to communicate roles.
- If children share the same schedule, group in one block; when schedules differ, separate blocks. Preserve the split-child view preference in existing dashboard specification.
- Independent timed activities (school drop-off, dentist, soccer, piano, art) appear in their correct day/time slots **below the all-day parenting-time span**; each shows relevant child avatar(s). Do not make an activity alter parenting time.
- Use visually differentiated category icons/colors, accessible text and tooltips/details; overlapping activities must remain understandable.
- Example only: a week-long “Time with Dad” all-day block with Dad and both children; a dentist appointment showing relevant child avatars; soccer practice with one child. Synthetic people/photos only.
- Upcoming panel echoes real event labels and avatars; Quick Add presents actual authorized workflows or honest non-functional placeholders. Lower cards include From Your Kids with artwork/photo previews, Recent Messages and Family Memories.
- Do not present proposed parenting-time changes as confirmed. Approval rules remain authoritative.

## Implementation and review
- Build on the current Angular architecture and existing branch changes; don't overwrite Claude's in-flight work.
- Match the approved mockup faithfully once its exact reference asset is committed; if missing, flag the missing asset instead of inventing a replacement.
- Maintain keyboard accessibility, screen-reader names, responsive/mobile layouts, contrast and honest states. Keep child privacy and parent approval rules server-enforced.
- Changes to approved visual design require user approval. Subsequent page mockups should share the same visual language.
