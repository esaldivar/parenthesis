# Shared Calendar — Product Decisions (October 16, 2026)

Status: approved design decisions for future implementation. Do not interrupt the Angular shell work currently underway. Implement incrementally; photo albums are a later phase.

## Parenting time and swaps
- Calendar defaults to weekly, with monthly view available. When children have identical caregiver/time windows, group them visually; otherwise separate.
- Select an existing parenting-time event and choose **Request Swap**. Proposed changes are pending until the other parent approves; no unilateral custody changes.
- A parent may add a descriptive title to their parenting-time block (e.g., "Dad's SeaWorld Adventure") and an optional event category (Vacation, Birthday, Holiday, School, Family Outing, Other). Show tasteful, subtle category labels/icons and restrained color accents. Titles/categories are separate fields.
- Named parenting-time events can later be linked to a photo album.

## Unavailability / blackout dates
- Either parent can mark themselves unavailable for an all-day date, multiple days, or specific hours. **All Day** is the default. Reasons are never required; any optional private notes must not be disclosed to the other parent.
- Recurring patterns are supported (e.g., weekdays 8 AM–5 PM). Editing/deleting a recurrence offers **This event**, **This and following**, or **All events**, like Google Calendar.
- Blackouts appear immediately on both parents' shared calendar, subtly styled (muted gray, small 'Unavailable' label; mobile may use a light dotted outline). Visible availability status, not private details.
- A request that overlaps the recipient's blackout shows a gentle, non-blocking warning: the other parent marked those dates unavailable; request may be difficult to accommodate. Actions: **Send Anyway** and **Choose Different Dates**. Requests can still be submitted and accepted/declined.
- Blackouts do not change existing parenting responsibilities. If a blackout overlaps the owner's confirmed parenting time, gently flag the conflict and suggest arranging coverage, but never automatically reassign.
- **A parent can't have the children and be unavailable at the same time** (owner decisions, October 22, 2026; #210). This is the one overlap that is refused, not warned about, and it has no Send Anyway:
  - Parenting time can't overlap its caregiver's own unavailable time, whichever parent adds it or proposes the swap. The message names the parent ("Dad is unavailable then"), never the private note.
  - Unavailable time can't overlap that parent's own pending or confirmed parenting time, including a change waiting for approval. Declined, withdrawn and cancelled parenting time doesn't count.
  - New items, repeating ones (every date is checked; nothing is added unless all dates can be) and edits that change the dates, times or caregiver are checked. Title and notes edits always work.
  - Overlaps made before this rule are left as they are; nothing is reassigned or removed.
  - The other parent's unavailable time keeps the gentle warning above.
- Upcoming blackout reminders are optional and **off by default**. New schedule/conflict request notifications are **on by default**. Keep notifications calm; maintain an activity center. Avoid noisy notifications for routine availability edits.

## Adding from the calendar (#212, October 22, 2026)
- Tapping empty space opens the existing Add page (Event, Task or Reminder); nothing is saved until the parent sends it. The Add buttons stay.
- Week time grids (Calendar and Home): the date and the start of the half-hour tapped, in the family's time zone. Events and reminders start then and last an hour (the form's usual length), ending the next day after 11 PM. A tapped time keeps its time whichever type is chosen; a task takes the date as its due date.
- The all-day row, Month days and the day lists: the date only.
- Tapping an event always opens its details, never Add.
- Keyboard: each week day column is a labelled button ("Add on Wednesday, October 28") that adds on that day; Month and the lists rely on it and the page's Add button rather than adding more tab stops.

## Dates (#232, October 23, 2026)
- Start and End are separate, side-by-side fields on Add, Edit and Request Swap (#249, October 23, 2026, replacing the one range calendar). Tapping anywhere in a field opens that date's own calendar; choosing a day sets that date alone and closes it, and nothing opens the other one. The date text is display-only (no typing, no phone keyboard), and the calendar icon is decoration, not a separate button. An empty End opens at the start's month. A repeat's last day, reminders and task due dates keep their single calendars.
- New dates start from today in the family's time zone; earlier times today are allowed. The server refuses a new start (or reminder date, or due date) before today, and moving one to a day before today.
- An event, reminder or task already in the past or under way keeps its own day when edited, so its title or notes can still change.
- Only days before today (in the family's time zone) are disabled in a calendar, other than an edited event's own days (#248, October 23, 2026). Nothing is disabled because of the other date, and nothing moves the other date: a start after the end, an end before the start, or a range over 31 days can be picked, turns that date's text red (no warning text on screen; the reason is in the field's accessible name), and the form can't be sent until it's corrected. This replaces the earlier rule that moving the start moved the end. An event lasts up to 31 days.
- Typed dates, where a field still allows typing (a repeat's last day, reminders, task due dates), are read as 10/27/2026 (or 2026-10-27); anything else gets a clear message.

## Joint events
- Support a **Joint Event** for occasions involving both parents (school events, holidays, birthdays, etc.), including occasions with no children present.
- Event fields: title, date, time, location; children multi-select with **None**, any selected children, or **All children**; optional category dropdown (**School**, **Holiday**, **Birthday**, **Other**) and free-text details.
- Show **both parent profile avatars** plus only the avatars of participating children. When None is selected, show parents only.
- Both parents must agree: creator's submission counts as their approval; other parent explicitly accepts before **Confirmed**. Until then, **Pending Approval**. Material edits after confirmation (date/time/location/attendees) require reapproval.
- Joint event acceptance must not implicitly change custody/parenting time.
- **One-off joint events only for the first version**; recurrence can be considered later.

## Repeats (#238, #239, October 23, 2026)
- Repeat options: does not repeat, every day, every week on the start's weekday, every month on the start's date, and Custom (every 1 to 99 days, weeks on chosen weekdays, or months). No yearly repeat. A repeat ends on a date or after a number of times, within a year of the first date.
- Monthly repeats use the same date each month and skip months without it (the 31st skips 30-day months).
- Parenting time is always the signed-in parent's own. Repeating it sends the co-parent one request for the whole series; approving or declining answers every date, and until then every date shows as pending. Holidays and family events don't repeat.
- The approvals inbox and the event details describe the series: how it repeats, how many dates it has and the first few ("12 dates: Oct 28, Nov 4, Nov 11 and 9 more").

## Event memories / photo albums (later phase)
- Associate uploaded photos with a named calendar event, automatically organizing them into that event's album, with a shared Memories gallery later.
- Photos **shared by default**, with a clear **Keep Private** control on individual photos. Enforce access server-side; private photos must not be visible to the other parent.
- Consider child-submitted artwork/photos/diaries separately, with child privacy protections and existing parental permissions.
- Phase 1: calendar naming, categories, visual tags, and event-to-album data relationship. Phase 2: uploads, private/shared photo controls, thumbnails, albums, Memories gallery.

## UX principles
- Neutral, emotionally calm, accessible UI. Never use jarring warnings or imply a parent is at fault.
- Keep pending vs confirmed states unmistakable. No changes to existing custody assignments without the proper approval.
- Use synthetic child data for demos.
