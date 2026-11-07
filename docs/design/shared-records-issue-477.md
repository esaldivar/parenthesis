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

## Implementation and review

- Reuse the parent shell, semantic theme tokens, and existing approval engine. Gate all records and attachments on current parent access in the same family. Child links are parent-only references.
- Prevent exposure through child routes, notifications, search, exports, direct links, or profile switches. Keep amounts and file details out of notifications.
- Start with the Shared Fund proposal, then connect parent-scoped persistence and version-specific approval before enabling navigation. Keep contribution reporting and Child Support behind their own implementation and review.
- Verify pending, revised, acknowledged, disputed and upload-error states, including keyboard and screen reader use, both themes, and phone and desktop layouts.
