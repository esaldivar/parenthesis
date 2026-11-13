# Issue #534 — English / Español localization implementation handoff

Status: owner decisions approved November 8, 2026. Branch: `feature/534-english-spanish-localization` (from `release/0.4.0`).

## Decisions (approved)
- Supported languages: English (`en`) and neutral Latin American Spanish (`es-419`).
- On first visit, detect the browser's preferred languages; choose Spanish for `es` / `es-*`, otherwise English. English is the fallback for missing or unsupported languages.
- An explicit language selection overrides browser detection and persists across reload and signed-out navigation.
- Signed-in parents have their own language preference. Each recipient receives system emails in their saved preferred language; absent a preference, use the established fallback.
- Start on the login page. Cover all *existing* parent-facing screens and signed-out flows. Future child account/profile UI is excluded.
- Never translate user-generated messages, diary content, names, notes, or attachments automatically.

## Implementation architecture
The frontend is Angular 22. Use runtime-switchable, catalog-backed localization rather than build-time-only language variants so users can change language without a reload or losing unsaved form state.

1. Inventory user-facing strings across Angular templates/TypeScript, validators, accessible labels, dialogs, notification content, backend error responses, and email templates.
2. Introduce a locale service with a typed `en` / `es-419` translation catalog, parameter interpolation, plural rules, and missing-key fallback to English. Prefer stable semantic keys. Set document `lang` and localized date/number formatters when locale changes.
3. Add a keyboard- and screen-reader-accessible **English / Español** control on the signed-out login page; use it across registration, password recovery, and shared-device authentication.
4. Add a language preference control in parent Settings and a per-parent server preference. Resolve initial locale from saved preference when authenticated, otherwise explicit local choice, otherwise browser detection. Do not leak a prior parent's locale preference across shared-device account changes.
5. Translate app shell and current parent-facing features in increments, maintaining both catalogs and tests in each PR.
6. Localize server-generated user-visible messages and system emails using the **recipient's** saved locale at send time. Preserve invariant identifiers and data values.
7. Add a CI translation-key parity check, unit tests for locale precedence, persistence and interpolation, UI tests for login and Settings switching, and Playwright smoke tests in both locales.
8. Test narrow phone widths, desktop, light/dark themes, screen readers, keyboard focus, long translated strings, reduced motion, and fallback handling.

## Phased delivery
- Phase A: foundation + login and signed-out auth.
- Phase B: parent Settings + persistence + navigation/app shell.
- Phase C: calendar, communications, Child Essentials (parent UI), Family Memories, Shared Records, and remaining parent screens.
- Phase D: server messages, notifications, emails, coverage audit, and development-site acceptance.

## Definition of done
- Both languages work throughout all currently implemented parent and signed-out UI.
- Locale selection persists correctly and never mixes parent preferences on shared devices.
- System email language is chosen per recipient.
- All user-facing keys exist in both catalogs; English fallback is tested.
- CI checks, automated accessibility checks and owner acceptance on Development are complete.

## Boundaries and risk
- Keep locale separate from user timezone, currency, and business logic. Date/time and number display may vary, but storage must not.
- Preserve security and privacy rules; avoid sending translated sensitive details to third-party translation services.
- Avoid claiming full coverage until the inventory and acceptance matrix have been checked.
- Do not merge or deploy without normal code review and owner acceptance.

Tracking: https://github.com/esaldivar/parenthesis/issues/534
