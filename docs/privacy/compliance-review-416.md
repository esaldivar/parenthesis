# Privacy compliance review (#416)

October 31, 2026. A technical review of the app against common privacy requirements, not legal advice. Inventory:
[data-inventory.md](data-inventory.md).

## Owner decisions (October 31, 2026)

- Operator: Eric Saldivar, an individual (no business entity yet).
- Intended users: families in the United States only, for now.
- Contact for privacy requests: `privacy@parenthesisfamily.com`.
- The notice says children may be under 13 and that parents provide their information.
- Privacy link: footer of every sign-in-area page, parent Settings, and the bottom of the kids' Settings page.

## Findings

- **Cookies and storage:** all strictly necessary or user-chosen preferences. No consent banner is required, and
  nothing in the browser waits on consent. A unit test flags any new storage use for review.
- **Optional processing that needs permission:** Google Calendar copying is opt-in per parent, and disconnecting
  removes the calendar and revokes access, which covers declining and withdrawing. Nothing else is optional today.
- **COPPA (children under 13):** children's profiles are created by a parent and approved by the other parent;
  children have no email or password. The notice has a children's section (what's collected, no ads or sale, parental
  review, change and deletion). The future child diary and artwork (v0.5.0) will collect content from children
  directly: revisit COPPA notice and consent before that ships.
- **US state privacy laws** (California CCPA/CPRA and similar): thresholds are unlikely to apply to a free beta run
  by an individual. The notice states that information is not sold or shared for advertising, which is accurate.
- **Google API Services User Data Policy:** the notice includes the Limited Use statement needed for Google
  verification of the Calendar scope.
- **EU/UK GDPR:** not applicable while the service is for US families only. Revisit before accepting families there.

## Remaining gaps (in TODO.md)

- `privacy@parenthesisfamily.com` must exist and reach the owner before production.
- No self-service data export; copies of data are handled by email within 30 days, as the notice says.
- Brevo's own retention of recipients, subjects and bodies is unchecked (existing TODO item).
- Audit records are kept indefinitely; decide a retention period.
- No mechanism yet to tell parents about significant notice changes (the notice promises to); an email or in-app
  notice is needed before such a change.
- A lawyer's review before public launch.
