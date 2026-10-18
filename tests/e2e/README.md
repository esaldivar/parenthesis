# End-to-end tests (Playwright release gate)

These tests run on release PRs (`release/*` → `develop`) against the release candidate, and cover every released
milestone. How it works, the rules for the suite, and how to run it locally:
[docs/runbooks/playwright-release-gate.md](../../docs/runbooks/playwright-release-gate.md).

- `specs/m1-foundation/`, `specs/m2-family/`, `specs/m3-calendar/`: tests per milestone, tagged `@m1`, `@m2`, `@m3`.
- `specs/regression/`: one test per fixed bug, named after its issue, tagged `@regression` and its milestone.
- `support/`: the API session (cookies and antiforgery), the Mailpit inbox, and synthetic families.
- `milestones.json`: every released milestone. Never remove one.
