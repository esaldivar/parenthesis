# ADR-0009: Frontend source ownership and feature layout

- **Status:** Proposed with the Dashboard pilot (#567).
- **Date:** 2026-11-10

## Context

The standalone Angular app is already organized by feature, but Dashboard mixes its routed page, leaf UI,
data source, scheduling logic, and Sass in one directory. Core and shared code are organized mostly by
responsibility, with shells in `app/layout` (moved to `app/core/layout` in the second slice). Several features also import date types and helpers from Dashboard.
Moving files incrementally lets us confirm that source boundaries and naming work without changing behavior.

## Proposed structure

```text
src/frontend/
  public/                          Direct-served assets with stable URLs
  src/
    app/
      core/
        guards/
        interceptors/
        services/                  App-wide singletons grouped by responsibility
        models/                    App-wide contracts
        layout/                    Parent and kid shells, navigation
      shared/
        components/
        directives/
        pipes/
      features/
        dashboard/
          pages/dashboard-page/    Routed page and its template, style and spec
          components/<name>/       Feature-owned UI and companion files
          data/                    Dashboard data source and its spec
      app.config.ts
      app.routes.ts
      app.component.ts             Root component and any companions
    styles/
      abstracts/                   Tokens and mixins
      base/                        Global defaults and typography
      themes/                      Theme definitions
    testing/                       Cross-feature fixtures and helpers
    index.html
    main.ts
    styles.scss
```

Keep global styles and test helpers under `src` alongside `app`, following their current entry points.
The root component currently lives in `app.ts`. Its rename belongs to the app-shell slice. Keep inline
templates and styles with small components that already use them. Create companion files or folders when they
have a consumer. Introduce `src/assets` for build-managed assets and `src/environments` for non-secret build
settings when needed. The existing workspace serves assets from `public` in both configurations and uses its
dev proxy for same-origin API calls.

### Import boundaries

- Application composition owns route registration and shell composition. Preserve the standalone lazy route
  loaders. When moving the shells, wire feature-owned UI such as the Messages dock at the composition boundary.
- Core services, guards, interceptors, and models support features through stable contracts. They depend on
  platform libraries or other core code. Core production code does not import a feature.
- Shared UI can use core contracts and other shared primitives. It does not import features. Reuse across two
  screens in the same feature is a reason to keep a component in that feature.
- Feature pages compose feature-local components, data and domain code. Extract genuinely cross-feature
  behavior at the narrowest shared boundary. When a feature intentionally hosts another feature's UI, import
  its designated entry component directly and keep the dependency one-way.
- Keep specs beside their source. Cross-feature fixtures such as `calendar-fixtures.ts`, `fake-auth.ts`,
  `date-format.ts`, `axe.ts`, and `toasts.ts` stay in `src/testing`. Feature-only fixtures stay with their
  consumers. Avoid new barrel exports and import cycles.

## Inventory and move map

Paths in this table are relative to `src/frontend/src` unless stated otherwise.

| Existing entry or dependency | Pilot and follow-up |
| --- | --- |
| `app/app.routes.ts` and `app/features/parent.routes.ts` | Keep root routes and parent/child guards in place. Update the parent Home route's dynamic import to the moved page. |
| `app/features/dashboard/dashboard-page.*` | Move to `app/features/dashboard/pages/dashboard-page/dashboard-page.component.*`, including the HTML, SCSS, and spec. |
| `calendar-key`, `child-avatars`, `dashboard-child-filter`, `status-label`, `week-calendar` in Dashboard | Move each to `app/features/dashboard/components/<name>/<name>.component.*` with its existing companions. |
| `dashboard/dashboard-data.ts` and its spec | Move both into `dashboard/data/`. |
| `dashboard/_proposed-fill.scss` | Move the shared fill mixin to `styles/abstracts/` and update its two Dashboard consumers and Calendar’s item styles. |
| `dashboard/week.ts`, `dashboard/model.ts`, and Calendar imports | **Done (dates slice):** the date helpers are `app/core/dates/dates.ts` (with their spec) and the `PlainDate` and `LocalDateTime` contracts are `app/core/dates/plain-date.ts`. Home's greeting stays in Dashboard (`dashboard/greeting.ts`), and so does `eventPalette` in `dashboard/model.ts` (its test moved from Calendar). Calendar, Messages and Memories no longer import Dashboard; Dashboard still hosts Calendar components and uses a Memories text helper, one way. |
| `app/features/calendar` | **Done (Calendar slice):** the six routed pages are in `pages/<name>/<name>.component.*` and the 16 components in `components/<name>/<name>.component.*`, each with its template, styles and spec. Domain code (rules, series, slots, filters, palette, search, text helpers), the shared `_item.scss` partial and specs that cover several files stay at the feature root. Components that reuse another component's stylesheet (event, reminder and task forms; event, reminder and task details) reference it by relative path. Route URLs and lazy chunks are unchanged; the total JS output was byte-identical in size. |
| Other features (approvals, auth, family, from-your-kids, invitations, kid, memories, messages, more, notifications, onboarding, profiles, settings, shared-records) | **Done (features slice):** routed and `*-page`/`*-callback` components in `pages/<name>/`, other components in `components/<name>/`, with the same naming and companions as Calendar; one commit per feature. |
| `app/features/child-essentials`, `app/features/privacy` | **Done (Child Essentials and Privacy slice):** the Child Essentials page is in `pages/child-essentials-page/` and its nine sections in `components/<name>-section/`, each with its spec and own stylesheet. The shared `essentials-section.css`, the `RevisionedSection` base class, update tracking, options, `localizedMessage` and the specs that cover several sections stay at the feature root. The Privacy Notice is in `pages/privacy-page/`. The total JS output was byte-identical in size. |
| `app/shared` | **Done (shared slice):** UI primitives are in `shared/components/<name>/` (appearance picker, avatar, brand, coming soon, decor, empty state, icon, photo editor, toast with its `Toasts` service) and the bottom-navigation clearance directive and its helpers in `shared/directives/overlay/`. File names are unchanged. There is no `shared/pipes/`: the app's pipes (`TranslatePipe`, `AppDatePipe`) are part of `core/i18n`. Routes and chunks are unchanged; the total JS output is 7 bytes smaller only because moved files change the order of bundled imports and their short aliases. |
| `app/layout` and root composition | **Done (second slice):** shells, navigation, focus handling and sample counts are in `app/core/layout`, with the shell spec beside them. The parent route loads `app/parent-app.ts`, which renders the parent shell and passes the Messages dock as a component input; the shell renders it with `NgComponentOutlet` in the same place and only off Messages, so `core` imports no feature. Route guards, providers and lazy loading are unchanged. The storage inventory spec still reads the Privacy inventory as a test-only dependency. |
| `styles.scss` and `styles/_tokens.scss` | **Done (Sass slice):** `styles.scss` stays the entry point and only `@use`s the layers, in output order: `styles/themes/_themes.scss` (light and dark from the token mixins, and the Material mapping), `styles/base/_overlays.scss` (bottom navigation clearance, Material button icons, CDK popups), `styles/base/_base.scss` (element defaults, typography, focus, utilities, motion) and `styles/base/_controls.scss` (calendar slot picks and date fields). The token mixins are `styles/abstracts/_tokens.scss`, beside `_proposed-fill.scss`. Compiled CSS was byte-identical in production and development builds. Add new global CSS to the layer it belongs to; a new partial goes into `styles.scss` at the point in the order where its rules belong. |
| `public/brand` and `public/art` (workspace root) | Retain the CLI's `public` copy rule and verify the same output paths and file bytes. |
| `src/testing` and `tests/e2e` (repository root) | Retain the test entry points, and update relative imports from relocated Dashboard specs. |

The pilot relocates the Dashboard files and references. App-wide layout, styles, import boundaries, and the
remaining feature moves proceed in focused PRs after the pilot. Track follow-up and release acceptance in
[TODO.md](../../TODO.md).
