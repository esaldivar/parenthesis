# Real screen-reader prerequisites (#281)

## Result on October 25, 2026: blocked

Guidepup is the intended tool for this work. Its real VoiceOver/NVDA drivers must produce observable speech before
Calendar acceptance is implemented or reported as passing. DOM names, axe results and a connected driver do not
establish screen-reader behavior. Continue using the existing `tests/e2e` synthetic families and release rules.

| Environment | Observed result |
|---|---|
| Windows 10.0.26300, installed NVDA 2026.2.0.57664 | NVDA is available on the owner's computer. |
| Guidepup 0.38.0; setup 0.29.3; official portable NVDA asset 0.2.1-2026.2 | Driver started, connected and stopped. A separate headed Chrome synthetic page did not yield the expected control announcement in this agent execution session. |
| macOS / real VoiceOver | No Mac or accessible Mac runner supplied. Not executed. |

The Windows control page contained only a synthetic heading, named button and second heading. The driver was
asked to navigate by heading and capture the button announcement. The expected synthetic phrase was absent;
the probe exited nonzero, with `status: blocked`, no completed steps and an empty sanitized control transcript.
There is no passing restored-regression result and no application acceptance transcript. No application SHA is
claimed for this platform-only page. Do not convert startup success or an empty transcript into a pass.

Temporary tools and downloaded assets were kept in ignored workspace directories. The official installer was
used to download NVDA; the system accessibility setup command was not run. No system-wide accessibility,
security, CI, paid-runner or repository protection setting was changed. The local diagnostic is experimental,
not a supported project runner or a completed test suite.

## Controlled runner requirements

Use an isolated, unlocked interactive desktop with one GUI test session at a time. Reserve it with a runner lock;
do not overlap a person's screen-reader session, other GUI tests, or real-family browsing. A Windows service or
headless-only worker cannot be assumed to have the required desktop. A hosted runner label alone proves neither
GUI compatibility nor actual speech. On macOS, validate the actual logged-in user's VoiceOver automation and
accessibility permissions before scheduling a release candidate. Configure required OS permissions explicitly
with the runner owner; do not silently grant them from a test.

Before implementing the Calendar journeys:

1. Pin supported Guidepup, browser and screen-reader versions. Follow the vendor prerequisites; do not run
   system setup blindly on a shared computer.
2. Open a local synthetic control page in a dedicated headed browser. Establish browser-content focus and a
   successful real next-heading command. Assert an expected named-control announcement.
3. Deliberately change that control's name, demonstrate the intended assertion fails, restore it and pass again.
   Repeat successfully before treating the environment as compatible.
4. Bound startup, each navigation/capture and the whole session. On failure, stop the owned driver and browser
   in teardown. A hung or silent driver is an infrastructure failure, never a skipped successful journey.
5. Capture OS/browser/screen-reader/Guidepup versions, exact application SHA, commands, timestamps and filtered
   synthetic speech. Exclude unrelated desktop speech, credentials, real family content and raw private logs.

Then extend `tests/e2e`, rather than introducing a competing suite. Reuse #279's scenarios and #278's isolated
Postgres/Mailpit families. Keep ordinary PR checks limited to their current policy. A controlled self-hosted path
must be restricted to trusted release-candidate work, explicit invocation and the reserved GUI desktop; do not
expose an unlocked self-hosted machine to arbitrary fork code or enable broad PR execution.

## Required acceptance map after the platform control passes

| Real speech / navigation evidence | Tracking |
|---|---|
| Single-day, repeated and continued Month title/date/status; correct details and return focus | #250, #213 |
| Date format; invalid reason and corrected state; independent Start/End choice | #236, #248, #249 |
| Reminder choice, selection and form semantics | #173 |
| Each polite success message once, without focus theft | #226 |
| Reachable confirmation choices, final delete and error recovery focus | #172, #176, #206 |
| Parent/child authorization and unavailable-note privacy with synthetic fixtures | #281 |

Run both real desktop drivers. Match meaningful phrases and behavior without brittle whole-utterance equality.
Keep the controlled negative and restoration in the same evidence set. Do not mark #281 accepted until both
platforms and the representative application journeys pass repeatedly.

Residual human checks remain: iPhone/iPad VoiceOver, Android TalkBack, physical touch and zoom/reflow, meaningful
reading order, and manually reviewed axe incomplete results. Desktop VoiceOver does not certify iOS; NVDA does
not certify TalkBack. No automatic WCAG or owner-acceptance certification is implied.

Vendor references: [Guidepup prerequisites](https://github.com/guidepup/guidepup/blob/main/README.md),
[NVDA driver API](https://www.guidepup.dev/docs/api/class-nvda),
[Guidepup Playwright integration](https://github.com/guidepup/guidepup-playwright/).
