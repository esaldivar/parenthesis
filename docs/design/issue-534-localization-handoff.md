# Issue #534 — English and Spanish localization implementation handoff

Status: implementation branch established; architecture plan (not completed functionality).
Base: `release/0.4.0`
Branch: `feature/534-english-spanish-localization`

## Approved decisions
- English (`en`) and neutral Latin American Spanish (`es-419`).
- For first-time visitors, use browser languages, falling back to English.
- App-owned emails use each recipient's saved language.
- Start at signed-out login and cover all existing parent-facing app screens.
- Future child-account/profile UI is deferred.

## Architecture
The frontend is Angular 22. A runtime-switchable localization service and translation dictionaries are recommended instead of separate language builds, because language must change without logout or navigation.
- Maintain a source English catalog and Spanish catalog with stable semantic keys; validate catalog parity in CI.
- Use locale-aware interpolation and plural rules, with escaping and safe English fallback.
- Store an explicit signed-out choice locally and the authenticated parent's preference server-side. Never let one parent's setting overwrite another's on a shared device.
- Resolve preference precedence carefully: authenticated parent preference, explicit current visitor selection, browser language, English.
- Set document language and locale formatting dynamically; maintain keyboard focus and avoid wiping form state.
- Localize application-owned server errors, validation, system notices and email templates. Resolve email locale independently for each recipient at send time. Preserve original user-authored text.

## Delivery slices
1. Inventory strings and existing authentication, Settings, notifications, emails and backend preference contracts. Confirm naming and architecture against current source before writing code.
2. Runtime locale foundation, typed/validated catalogs, tests and developer guidelines.
3. Login and other signed-out auth screens, accessible selector and reload persistence.
4. Signed-in Settings, server preference, account isolation and app shell.
5. Parent features by domain, including mobile/desktop and light/dark.
6. Backend-generated strings, system emails and locale-sensitive formatting.
7. CI, Playwright, accessibility and development-site acceptance.

## Test requirements
- English and Spanish sign-in, recovery and shared-device flows; browser preference fallback.
- Switch without reload or lost form data; reload, sign out and sign in; verify two parents retain independent choices.
- Missing Spanish translation uses readable English, never a raw key.
- Plurals, parameters, dates, numbers, time zones and emails.
- Parent features, responsive layouts, enlarged text, keyboard and screen reader.
- No translation of parent-entered notes, chat, attachments or other user-generated content.

## Release gates
Do not merge or deploy without code review, passing tests, SonarCloud/Playwright gates and owner acceptance. Update issue #534 and TODO.md as slices land.
