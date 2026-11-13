# End-to-end tests (Playwright release gate)

These tests run on work PRs into `release/*` and release PRs (`release/*` → `develop`) against each PR merge candidate, and cover every released
milestone. How it works, the rules for the suite, and how to run it locally:
[docs/runbooks/playwright-release-gate.md](../../docs/runbooks/playwright-release-gate.md).

- `specs/m1-foundation/`, `specs/m2-accounts/`, `specs/m3-calendar/`: tests per milestone, tagged `@m1`, `@m2`, `@m3`.
- `specs/regression/`: one test per fixed bug, named after its issue, tagged `@regression` and its milestone.
- `support/`: the API session (cookies and antiforgery), the Mailpit inbox, and synthetic families.
- `milestones.json`: every released milestone. Never remove one.

M3 now has 320/390px touch Chromium/WebKit profiles alongside desktop. See the runbook's M3 mobile section for
targeted commands, report guards, coverage map and current unexecuted acceptance gaps. Profile discovery is not a
passing browser run.

Accessibility (#279), in addition to the runbook's rendered-accessibility section:

- `a11y-states.json` also requires `approvals-decline`: the open Approvals decline form with a synthetic draft
  reason, cancelled by keyboard without deciding the proposal (verified through the API).
- Week and List assert that pending and declined proposals are named "Pending approval"/"Declined", never
  "Confirmed". Month's "Proposed" name stays unit-tested, because that shared day can fold into "+N more".
- The release summary lists every axe violation's rule ID, state, profile, tested SHA and sanitized selectors,
  including violations from failed executions. Any violation fails the gate. There are no exceptions or baselines;
  any future narrow exception needs the rule, element, reason, tracking issue and an expiry, approved in its own PR.
