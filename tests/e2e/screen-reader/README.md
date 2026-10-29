# Real screen-reader tests (issues #281 and #279)

These tests are **opt-in** and run serially in a headed browser. The required release configuration and workflows are unchanged. Application tests use actual Parenthesis pages and API-created synthetic families, not intercepted application responses. The smoke fixture alone uses synthetic HTML.

## Windows verification

Use an unlocked interactive Windows desktop with NVDA and the isolated local HTTPS Parenthesis candidate, Postgres and Mailpit running. See [candidate setup](../../../docs/runbooks/playwright-release-gate.md#running-it-locally). The tests refuse non-loopback app/Mailpit hosts before creating accounts. They leave synthetic records in the disposable database; fixture disposal closes API sessions, not database rows. Do not point them at shared environments.

From PowerShell:

```powershell
Set-Location C:\Users\Eric\Documents\ChatGPT\Parenthesis\tests\e2e
# Only if dependencies have not been installed; preserve any local npm changes first.
npm ci
# One-time host setup, if not already completed:
npx @guidepup/setup setup
npx @guidepup/setup install
npx playwright install chromium

$env:E2E_BASE_URL = 'https://localhost:8443'
$env:MAILPIT_URL = 'http://localhost:8025'
npm run typecheck
npx playwright test --config=guidepup.config.ts --list
npx playwright test --config=guidepup.config.ts --project=screen-reader-desktop --workers=1 --reporter=line
npx playwright test --config=guidepup.config.ts --project=screen-reader-app-nvda --workers=1
npx playwright show-report guidepup-report
```

The installed Guidepup dependencies are already tracked in package.json/package-lock.json. No reinstall or package rewrite is necessary for an existing working host. Keep the browser foreground and avoid typing or switching windows during execution. Guidepup checks the foreground title before its own activation; every scenario explicitly brings its page forward first. A blank transcript can indicate a desktop/speech-capture failure.

## Coverage

| Spec | Actual behavior asserted |
| --- | --- |
| `real-reader-smoke` | Real heading speech distinct from the window title, without an app server |
| `navigation-nvda` | All seven desktop sidebar names and destinations, link speech, Settings/Calendar activation, current-page state and main focus, Notifications/account button labels |
| `forms-nvda` | Activity Title required/edit speech; Category, date, child, optional Location/Notes labels; empty-title alert, invalid state and focus; no invalid POST; keyboard correction and Cancel |
| `calendar-nvda` | Calendar heading, Add link, Activity choice, invalid-title announcement, keyboard creation and confirmation without toast focus theft, exactly one confirmed saved activity |
| `calendar-dialog-nvda` | Named event button/dialog, initial heading focus, Close/Edit/Cancel labels, both focus-trap boundaries, Keep it confirmation description, Escape and Close returning focus, confirmed event preserved |

NVDA keyboard APIs move focus and activate controls. Playwright observes focus, roles, values, URL and saved state. Speech assertions use actual captured NVDA phrases; shared helpers clear speech between actions and attach checkpoint transcripts on failure. The application dialog test never calls Guidepup's page-navigation helper while the dialog is open (that helper itself resets page focus).

## Evidence and limits

The owner reported the earlier Windows smoke test passed (1 test, 14.5 seconds). That does not establish a pass for these new app tests or the revised smoke fixture. Run the commands above on the exact committed candidate and record SHA, OS, Chromium, NVDA and Guidepup versions, counts, and sanitized speech attachments from `guidepup-results`/`guidepup-report`. Review traces privately: browser diagnostics can contain synthetic session credentials.

Prove a controlled negative locally: temporarily change an expected speech label (for example `notifications` in `navigation-nvda`) to a unique absent phrase, rerun that spec and verify it fails at the speech assertion. Restore the assertion and rerun. Do not commit the deliberate failure or treat type checking/list discovery as NVDA evidence.

Windows app execution, controlled-negative evidence, repeated stability runs, macOS VoiceOver, real mobile readers and wider Calendar/approval scenarios remain open in TODO.md. Keep this PR draft and the pilot separate from the release gate until supported-host evidence and owner approval justify promotion.

API references: [Guidepup Playwright](https://github.com/guidepup/guidepup-playwright), [NVDA](https://www.guidepup.dev/docs/api/class-nvda).
