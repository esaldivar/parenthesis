# Calendar accessibility browser evidence — October 25, 2026

## Result

The focused accessibility matrix passed **25/25 executions**, with **270 required state scans**, zero violations,
zero flaky/skipped executions and no Playwright global errors. This is five unique scenarios across five profiles,
not 25 unique scenarios. The run began at `2026-10-25T21:09:07.856Z` and took 519 seconds.

| Profile | Executions passed | Scans |
|---|---:|---:|
| Desktop Chromium | 5 | 54 |
| Touch Chromium, 320px | 5 | 54 |
| Touch Chromium, 390px | 5 | 54 |
| Touch WebKit, 320px | 5 | 54 |
| Touch WebKit, 390px | 5 | 54 |

Both light/dark application journeys run per profile, plus a controlled scanner negative that detects an
unlabeled input and passes after its name is restored. The source candidate was
`bf0aa3ffcf8b0b3f586e025c546090bbb213f4e5`; a local API image built from that checkout served the app over HTTPS
with isolated synthetic Postgres/Mailpit data. Artifacts recorded that exact SHA. Later commits restore a leaked
unit-test media-query mock and guard an animation API absent in DOM-only environments; they are not silently
substituted for the recorded browser candidate. Required CI verifies the final PR head separately.

The local invocation used the existing Playwright configuration through a temporary wrapper that only selected
the isolated app URL, output directory and candidate metadata:

```sh
E2E_BASE_URL=https://localhost:19443 MAILPIT_URL=http://localhost:18025 \
  node tests/e2e/node_modules/@playwright/test/cli.js test \
  -c .data/e2e-279/followup.config.mts accessibility.spec.ts --workers=2
```

The standard project command remains `npm test -- accessibility.spec.ts --workers=2` from `tests/e2e`, with an
already-running isolated candidate and the environment URLs set. The temporary wrapper is not a CI dependency.
The existing release workflow retains its complete suite and artifact publishing; browser execution has not
been enabled on ordinary work PRs.

## Detection and repair evidence

- Before the visible-name repairs, rendered scans detected account, pending Month status and Material period
  label mismatches. These were repaired in #302 after the scanner foundation in #301.
- The subsequent complete repaired run finished 13 passed / 12 failed. A focused keyboard reproduction showed
  Material ignoring `close()` during its opening animation despite changing the selected date. Completing close
  after that animation fixes the fast-selection path and retains normal focus restoration.
- WebKit measured an overflow button at 22.3px wide; it now has a 24px minimum width. The approved 24px bars and
  day-number layout were preserved.
- Mobile diagnostics identified sticky navigation as the overlapping element in the remaining reported target
  and contrast findings. The same pages passed after normal scrolling without any style/rule/exclusion change.
  Whole-document audits now record a deterministic document-end position; see the upstream limitation and
  protocol in [the runbook](playwright-release-gate.md). This is not a waiver for physical/focus overlap.

## Limits and remaining review

The unchanged release summarizer correctly **rejects this targeted report as a complete release gate**: M1/M2
and the other mobile acceptance scenarios were not selected. It validates all 270 accessibility attachments but
does not turn a focused green run into a complete release pass.

There are **343 incomplete rule results requiring review**, counted per scan/rule rather than unique defects:
233 `color-contrast`, 80 `aria-hidden-focus` and 30 `th-has-data-cells`. The latter groups include Material focus
trap anchors and picker tables; their presence is not an automatic acceptance or exception. Review the actual
artifacts and rendered states. No rule or overlay was excluded and no baseline was accepted.

Retain manual checks for meaningful reading order, contrast axe cannot resolve, zoom, physical touch and usable
sticky-navigation focus at arbitrary scroll positions. Real VoiceOver/NVDA speech remains #281; mobile desktop
emulation does not certify iOS VoiceOver or Android TalkBack. This report does not sign off the linked product
issues, owner acceptance, deployment or WCAG conformance.
