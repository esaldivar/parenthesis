# M7 — Beta Readiness & Quality

Gates for inviting external parent beta testers. **The parent beta is release v0.7.0** (owner decision, November 13,
2026; it was v1.0.0 before). This is the **parent** product only; the child experience (M8) has
its own launch gates. Nothing here is declared complete without evidence (a CI run, a report, a recorded device test).

## Where quality stands (November 13, 2026)

| Area | Today |
|---|---|
| Frontend unit tests | Vitest: 98 files, 1,046 tests passing locally on `release/0.4.0` |
| Backend tests | Unit, integration and architecture test projects (about 375 test methods); run in CI |
| End-to-end | Playwright: 33 specs (M1–M4 and regression), Chromium plus mobile widths, sharded 3 ways, required before release PRs |
| Accessibility | axe checks in unit tests; NVDA and Guidepup pilots (#443 macOS VoiceOver in progress); WCAG 2.2 AA plan in #112 |
| Performance | Calendar load timing runbook; no Lighthouse budget yet (#109) |
| Security | SonarQube Cloud gate on releases, Sonar Sunday, Dependabot, breach-response runbook |
| Monitoring | Application Insights (#86), uptime checks with Discord alerts (#114), daily health report |
| Release | release → develop → main with owner-approved production deploy; rollback puts the previous image back (migrations are not undone) |

## Beta gates

A gate passes only with the evidence named.

1. **No known critical defects.** No open `priority:critical` bug in the parent app. Evidence: issue query.
2. **No unresolved critical privacy or security findings.** Sonar gate green on the release; no open security hotspot
   unreviewed; dependency review clean. Evidence: Sonar analysis link.
3. **Authentication and recovery.** Sign-up, sign-in, sign-out, password reset, invitation acceptance, account
   deletion, and (if M6 shipped it) Sign in with Google and linking pass end to end. Evidence: Playwright specs.
4. **Core parent workflows.** Calendar and approvals, messages, Shared Records, Child Essentials, memories, settings
   pass end to end with two parents in one family and a second family for isolation. Evidence: Playwright report.
5. **Layouts.** M5's acceptance checks pass at 320, 768, 1280 and 1920 px in light and dark. Evidence: screenshots.
6. **Accessibility.** WCAG 2.2 AA automated checks pass; manual keyboard, NVDA and VoiceOver checks on core flows
   (#112, #443). Evidence: accessibility report.
7. **Languages.** Every supported parent screen and system email in English and Spanish (#534 remainder). Evidence:
   Spanish screenshots and email checks.
8. **Performance.** Lighthouse budgets in CI for Home, Calendar and Messages on mobile settings (#109): agreed LCP,
   CLS and INP limits. Evidence: CI run.
9. **Real devices.** iPhone Safari, Android Chrome, desktop Safari, Chrome, Edge and Firefox on the core flows.
   Evidence: dated device checklist.
10. **Privacy notices.** Privacy notice matches actual behaviour, including Google integrations. Evidence: review
    record.
11. **Release and rollback.** A rehearsed rollback on Development, and the production approval step documented.
    Evidence: runbook entry.
12. **Monitoring.** Alerts reach the owner for errors, availability and failed deploys. Evidence: test alert.
13. **Beta feedback process.** How testers report problems, how reports become issues (synthetic data only in issues),
    triage labels and response targets. Evidence: published doc.

## Issues

- #645 Epic: M7 beta readiness gates (tracks the gates above).
- Existing: #109 Lighthouse, #110 public-site metadata and indexing boundaries, #112 WCAG 2.2 AA testing, #443
  VoiceOver.
