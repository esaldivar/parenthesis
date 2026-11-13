# Shared records design handoff

[M4 issue #477](https://github.com/esaldivar/parenthesis/issues/477) · Core mockups approved by Eric on November 7, 2026.

| Layout | Light | Dark |
| --- | --- | --- |
| Mobile | [Mobile light](assets/shared-records/M4-477-mobile-light.png) | [Mobile dark](assets/shared-records/M4-477-mobile-dark.png) |
| Desktop | [Desktop light](assets/shared-records/M4-477-desktop-light.png) | [Desktop dark](assets/shared-records/M4-477-desktop-dark.png) |

## Shared Fund

Use **Shared records** in the parent workspace. A parent proposes a titled fund, optionally links children, selects a currency, and enters each parent's share. The shares may differ. The proposed target is their sum. Sending the proposal explicitly records the sender's agreement. The fund stays **Awaiting agreement** until the co-parent approves that exact version. A revision needs fresh agreement, and the other parent can request changes.

When contribution reporting is implemented, keep acknowledged, pending, and disputed amounts distinct. The thermometer shows acknowledged progress, with the amount, target and pending amount in text. Vendor purchases use **Acknowledge contribution**. A transfer to the other parent uses **Confirm receipt**. The payment attachment is required for a contribution report. An optional purchase receipt belongs to the fund itself.

## Child Support

Use a distinct **Child Support** label for an optional one-time record. Record external payments as a lump sum or in parts with supporting attachments. Parenthesis keeps a shared record of reported and acknowledged payments. Follow the applicable official payment process. Review terminology, access and retention before implementing this flow.

## Built (November 7, 2026)

The owner asked for the rest of #477 to be finished in v0.4.0. What was built, and the choices made where the handoff
left them open:

- **Navigation.** *Shared records* sits after Child Essentials in the sidebar and under More on phones. A dot (with
  "waiting on your response" for screen readers) shows while a proposal or a report waits on this parent. It stands in
  for notices until the in-app feed (#178); it never carries amounts, titles or file details.
- **Contributions.** Once a fund opens, either parent reports an amount, the date the money moved, whether it went to a
  vendor or to the other parent, and a required PDF, PNG or JPEG (10 MB at most, checked by content, not name). The other
  parent then uses **Acknowledge contribution** (vendor) or **Confirm receipt** (paid to them), or **Flag a mismatch**.
  Only acknowledged amounts fill the thermometer. Pending amounts are shown in text, and disputed amounts never count.
  A report isn't edited afterwards: a correction is a new report, so history is never replaced. Submitting the same
  report twice (a retry) records it once.
- **Child Support.** Either parent starts a one-time record: a title (such as the period), who pays, the currency and
  an optional reference amount. Only the paying parent reports payments, one lump sum or several parts, each with its
  attachment; only the other parent confirms receipt or flags a mismatch. Nothing recurs. The record and the form
  both say it's a shared record of payments, not a request for payment or an official record, and that confirming
  receipt doesn't verify bank settlement or compliance with an order.
- **Privacy and retention.** Only the two parents on a record can see it, its history or its attachments; children,
  other families and parents who have left get "not found". File names aren't stored: the history says *Payment
  attachment · PDF*. Attachments download with a generic name and are served with no caching. Records and attachments
  stay while either parent remains, and are deleted when the family closes.

## Implementation and review

- Reuse the parent shell, semantic theme tokens, and existing approval engine. Gate all records and attachments on current parent access in the same family. Child links are parent-only references.
- Prevent exposure through child routes, notifications, search, exports, direct links, or profile switches. Keep amounts and file details out of notifications.
- Start with the Shared Fund proposal, then connect parent-scoped persistence and version-specific approval before enabling navigation. Keep contribution reporting and Child Support behind their own implementation and review.
- Verify pending, revised, acknowledged, disputed and upload-error states, including keyboard and screen reader use, both themes, and phone and desktop layouts.
