# ADR-0008: Parent-to-parent messaging and the first live connection

- **Status:** Accepted (owner decision, 2026-11-06).
- **Date:** 2026-11-06
- **Source:** [issue #125](https://github.com/esaldivar/parenthesis/issues/125) and the owner's M4 Chat handoff
  ([`docs/design/m4-chat.md`](../design/m4-chat.md), PR #447). The handoff is the later owner decision where they
  differ.

## Context
M4 adds private text messaging between the two parents of a family. The handoff asks for unread state, read
receipts, a typing indicator, and retries that can never duplicate a message, over a live connection. The
architecture already planned a `Messaging` module and SignalR, but no hub existed yet.

## Decisions
1. **One conversation per family**, between its active parents. #125 left this open; the handoff scopes chat to "the
   two parents in a family". No group or child conversations. Child sessions get 403 (ADR-0006), and every endpoint
   also requires the Parent role.
2. **Text only, immutable.** No edit, delete, attachments or media endpoints exist. Messages are trimmed, at most
   2,000 characters.
3. **Idempotent sends.** The sender's device gives each composed message a `ClientMessageId`; it is unique per
   family and sender. A retry, a repeated click or a lost response returns the stored message (200), never a second
   copy. Concurrent duplicates are resolved by the unique index.
4. **Order** is a database-assigned sequence number, not the clock or the id.
5. **Read receipts** are one read position per parent, which only moves forward. Clients report a message as read
   only when it is visible in an active conversation (the handoff's default). Sending marks the conversation read up
   to your own message. Unread counts are the co-parent's messages after your position, capped at 99.
6. **Typing** is sent through the API and pushed live, never stored. This reverses #125's earlier "no typing
   indicators" because the handoff, the later owner decision, asks for a transient one. Presence ("online") stays out.
7. **Live updates (SignalR, `/hubs/chat`).** The hub is listen-only: clients call `Watch(familyId)`, and all changes
   go through the REST API with antiforgery and the tenant gate. `Watch` checks an active Parent membership, the same
   rule as the tenant gate, and gives one answer for "not yours" and "doesn't exist". Child sessions are refused at
   negotiate. Because the hub uses the session cookie (ADR-0004), requests from another website's page are refused by
   host comparison (cross-site WebSocket hijacking). Pushes are best effort: the REST endpoints stay the source of
   truth, and clients reload after reconnecting.
8. **Account deletion (A-12).** The departing parent's read position goes. Their messages stay, because they are the
   co-parent's record and can't be edited or deleted; the sender shows as a former parent. Their saved transcripts
   (decision 10) go with them. When the whole family closes, every message and transcript goes.

9. **Shared calendar events (slice 2).** A message may carry one event id. Each parent's card is read through the
   Calendar's own rules for them (`ISharedEventCards`): the same events their calendar and event details show, another
   parent's unavailable time only as "Unavailable", and a proposal marked as pending. A cancelled event, or a declined
   request the parent removed, shows as no longer available with nothing else about it. Only an event on the sender's
   own calendar can be shared. Live pushes carry just the id; each device reads its own card.

10. **PDF transcripts (slice 3).** A parent previews the conversation for all messages or a range of family-local
    dates (from local midnight on the start date up to local midnight after the end date, both included), then
    downloads a copy or saves one. The preview is built from the same model as the PDF, so it shows exactly what the
    PDF holds. Downloads are made on request and not kept. A saved transcript is an unchanging snapshot belonging to the
    parent who saved it: only they can list or open it (another parent's, or another family's, reads as not found).
    Its PDF is stored in the Messaging schema (`messaging.transcripts`), goes when its parent leaves or the family
    closes, and is always sent with `Cache-Control: no-store`. Shared events are described as that parent's calendar
    shows them, so a proposal never reads as confirmed. Only sent messages are included; drafts and failed sends
    never reach the server. A transcript holds at most 5,000 messages, and saving and rendering are rate limited. The
    PDF is drawn with SkiaSharp and embedded Noto Sans (SIL Open Font License), whose Latin, Greek and Cyrillic glyphs
    cover the app's text today; other scripts would need more fonts.

## Consequences
- Group membership in the hub lasts until the connection closes. A parent who loses membership mid-connection stops
  receiving updates at their next reconnect; their REST access ends at once. Their session also ends with account
  deletion.
- More than one API instance would need a SignalR backplane (for example Azure SignalR); today the app runs one.
- Slices 2 and 3 of the handoff (calendar cards, compact desktop chat, PDF transcripts) build on these tables and
  endpoints.

## Owner decisions (2026-11-06)
- A deleted parent's messages stay for the co-parent, shown from a former parent (decision 8).
- The navigation label stays **Messages**.
- Dictation is the phone keyboard's own: there is no in-app microphone button, so no audio goes to a browser speech
  service. The text it fills in is sent with the separate Send button.
- The compact desktop chat opens from Minimize on the Messages page; no separate launcher for now.
