# Parenthesis M4 Chat implementation handoff

## Design references

- [Mobile dark and calendar sharing](m4-chat/mobile-dark.png)
- [Desktop calendar with compact chat](m4-chat/desktop-popup.png)
- [Full desktop chat and transcript export](m4-chat/desktop-transcripts.png)
- [Mobile transcript export](m4-chat/mobile-transcripts.png)
- [Unread, typing, and retry](m4-chat/chat-states.png)
- [Light-mode layouts](m4-chat/light-mode.png)

Use Parenthesis theme tokens in both modes. Mobile opens directly into the conversation. Its header has Back, the co-parent avatar and display name, calendar search (magnifier), and Transcripts (document icon). Treat the extra calendar icon in the states board as a mockup artifact.

## 1. Core messaging

- Scope to the two parents in a family. Enforce membership server-side on history, sends, receipt updates, and live subscriptions. Children have no chat access.
- Use a text composer and send control. Mobile dictation inserts editable text and requires a separate Send action. Keep manual entry available if dictation fails or is unavailable. Scope excludes calls, voice notes, media, attachments, GIFs, emoji picker, and online status.
- Show an unread dot on Chat navigation, a New messages divider before the first unread message, and Read beneath the latest outgoing message acknowledged by the co-parent. Show a transient typing indicator above the composer. In-app unread indication only.
- Retain failed text with Not sent and Retry. Retry the same logical message using a stable client message ID so a lost response or repeated click cannot duplicate delivery.
- Verify two-parent exchange, child and unrelated-family denial, reconnect and retry, and receipt advancement across views.

## 2. Calendar sharing and compact desktop chat

- The magnifier opens a calendar picker. Search by event title or date, select an event, review it in the draft, and send it as a tappable card with title, date and time. Event details use existing Calendar permissions.
- Dock the compact desktop window in the bottom right over the current page. Provide Minimize and Expand. Like a messaging tray (owner, November 7, 2026), it's always there on desktop: minimized, it's a bar along the bottom right edge with a dot that pulses (steady with reduced motion) while a message is unread; there's no Close. Use the same conversation and draft when expanding to the full Chat page, including any selected event.
- Verify the underlying page remains interactive outside the pop-up, the draft survives minimize and expand, and the linked card opens the correct event. Cover no results and an event that becomes unavailable.

## 3. PDF transcripts

- On full desktop Chat, place Save transcript and Saved transcripts in a left column. On mobile, the document icon opens a dedicated Transcripts screen with the same actions.
- Offer All messages or a start and end date. Include both endpoint dates. Preview the PDF with the selected range, sender names and message timestamps. Include both dates in a range export filename.
- From preview, Save transcript creates an entry in Parenthesis. Download PDF creates a device copy. A saved entry shows its filename and message date range and reopens the saved PDF.
- The [approved PDF design](https://github.com/esaldivar/parenthesis/issues/548) uses a grayscale chronological column with the profile names and a date, time to the second, and UTC offset on every message. Keep day headings with a message. When long text continues, repeat the date, sender, and original timestamp. Include the inclusive range, participants, family time zone, generation timestamp, and page count.
- Represent shared calendar items with the localized “Linked Calendar Event” label only. Preserve authored text, and use the viewer's language for document labels. Saved PDFs reopen as the original snapshots.
- Verify inclusive date boundaries, a single-day range, invalid and empty ranges, reopen after reload, and authorized access to the exported PDF.

## Proposed behavior defaults for implementation

- Advance the read position when incoming messages are visible in an active conversation. Keep the position monotonic across sessions. Clear the unread dot when the latest incoming message is acknowledged. A minimized pop-up or background tab does not mark messages read.
- Keep draft state scoped to the signed-in parent and conversation. Share it between the desktop surfaces within the session. Typing expires after a short idle interval.
- Use the family's time zone for range boundaries and PDF timestamps. Query from local midnight on the start date up to local midnight after the end date. Reject a reversed range inline. If the range is empty, keep the dates and show “No messages in this date range” without offering a blank export.
- Save an immutable PDF snapshot of sent messages for the requesting parent. Keep Download separate from Save. Exclude drafts and failed sends. Protect list, preview and download by parent and conversation access.

Implement in the order above. Calendar cards and transcript exports build on the core conversation. Check keyboard operation, focus return from dialogs, and readable status labels in both themes during each slice.

