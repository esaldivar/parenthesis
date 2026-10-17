# Parenthesis TODO

The single list of work the owner has called a to-do, and of work left unfinished. **Rule:** whenever the owner says
something is a to-do, or work is left incomplete or deferred, it's added here, in the same change. Tick items off
(`[x]`) in the PR that finishes them, and add the date. In code, mark the exact spot with a `TODO(<area>):` comment
that points back here.

## Big projects
- [ ] **SonarQube Cloud (Free plan) protecting `main`** (big to-do; owner decision, October 17, 2026). It gives code
  quality, security and vulnerability analysis at no cost. The plan only covers PRs into `main` and `main` itself,
  which is all that's needed. The paid plans and the self-hosted server were ruled out on cost.
  - [x] Pipeline ready: `.github/workflows/sonar.yml` runs on PRs into `main` and on `main`, and is skipped until
    it's connected (October 17, 2026).
  - [x] **Owner:** SonarQube Cloud organization and project created, and the token and keys added to GitHub
    (October 17, 2026).
  - [x] First analysis ran on release PR #27 (October 17, 2026). It found 1 vulnerability (fixed in #28) and 0%
    coverage, because no coverage reports were being sent yet.
  - [x] The quality gate (**SonarCloud Code Analysis**) and **SonarQube Cloud** are required checks on `main`, so a
    failing gate blocks releases (owner decision, October 17, 2026).
  - [x] Coverage reports go to Sonar: backend via `dotnet-coverage`, frontend via Vitest lcov (October 17, 2026).
  - [x] Quality gate green on release PR #27: security, reliability and maintainability all A, 98.6% coverage on new
    code (October 17, 2026).
  - [ ] **Weekly rhythm** (owner decision, October 17, 2026). Sonar Sunday issue → fix PR into `develop` → Release
    Tuesday. Both workflows are written; they start running once they're on `main` (the next release). Then check
    the first automatic Sonar Sunday issue.
  - [ ] **Owner:** in SonarCloud, mark the `tabindex` code smell on the calendar's scroll area as **Accepted**,
    with the reason "required so keyboard users can scroll the hours".
  - [ ] Add the quality-gate badge to the README.
  - [ ] **Owner, optional:** install SonarQube for IDE (formerly SonarLint), which is free, in connected mode.
- [ ] **Branching model and protected branches** (requested October 17, 2026).
  - [x] `develop` created from the latest work (`feat/angular-shell`, which is now retired).
  - [x] CI runs on pushes to `develop`. The **PR source** check only lets `develop` or `hotfix/…` merge into `main`.
    The model is documented in CONTRIBUTING.md.
  - [x] Branch protection on `main` and `develop`: PRs only, required checks up to date, no force pushes or deletions, admins included (October 17, 2026).
  - [ ] First release: PR `develop` → `main`, so `main` gets the dashboard work. This is the owner's call, since
    `main` is the site.

- [ ] **Deployment: development and production environments** (scoped October 17, 2026; to plan later).
  - Two environments:
    - **Development**, deployed automatically from `develop`: the newest features, **synthetic data only**.
    - **Production**, deployed from `main` on each release: the stable version, with real families.
  - Each environment gets its **own database**. Development must never hold real family or child data.
  - Platform: Azure, as the architecture already chose (Container Apps, Azure Database for PostgreSQL, Blob Storage,
    Key Vault). Confirm this with the owner, including AWS as the alternative, when planning.
  - Keep costs low: small tiers, and check what Azure's free offers cover.
  - **Real email sending** for deployed environments, for example Azure Communication Services Email. Mailpit only
    catches mail locally. Email is used for account confirmation, password resets and account-safety notices, and
    later for approval notifications.
  - Domain names, HTTPS, the pipeline (deploy `develop` → dev, `main` → prod), secrets in Key Vault, database
    migrations on deploy, backups, monitoring.

## Dashboard and design
- [ ] Corrected horizontal logo SVGs from ChatGPT (`parenthesis-logo-horizontal.svg`, `-dark.svg`). The requirements
  are in `src/frontend/src/app/shared/brand/logo.ts` (`TODO(brand)`).
- [ ] Commit the exact approved dashboard image as `docs/design/assets/approved-dashboard-2026-10-16.png`, or confirm
  that `3116E10A-….png` is it.
- [ ] Choose the rounded brand typeface (open in `docs/design/BRANDING.md`).
- [ ] Recent Messages: decide whether the card shows messages from the children (as in the mockup) or from the other
  parent (current sample).
- [ ] Replace placeholder counts (`src/frontend/src/app/layout/sample-counts.ts`) with real unread and notification
  data.
- [ ] Deferred (owner OK for now): photo avatars, kids' artwork and memory photos (initials and tiles are used).

## Backend features the dashboard is waiting on
- [ ] Calendar and parenting-time endpoints, including change requests and approvals.
- [ ] Family events (both parents attend) and parent unavailability. These are UI-only mock categories today.
- [ ] Kid shares, messages, memories, and notification/unread APIs.

## Platform hardening (from the architecture backlog)
- [ ] F-09 transactional outbox.
- [ ] S-01 data-protection key ring.
- [ ] S-03 forwarded headers behind the proxy.
