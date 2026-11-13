# Dependency review: issue #275

Inspected the current `release/0.3.0` branch on October 26, 2026. The issue's
description is stale: all three Dependabot PRs were merged on October 25.

| PR | Observed disposition | Candidate evidence | Review result |
| --- | --- | --- | --- |
| #229 | Merged; Docker Node 24 to 25 | CI 40191971272 and branch policy 40191971271 succeeded | Rework: Node 25 is outside the current frontend engine range and is EOL. Restore Node 24 for the SPA build stage. |
| #230 | Merged; checkout, setup-node, setup-python majors | CI 40193099751, workflow scripts 40193099732 and branch policy 40193099753 succeeded | Application CI passed; upstream runner requirements and breaking-change review remain incomplete. |
| #231 | Merged; NodaTime 3.3.6 and SwaggerUI 10.3.1 | CI 40193357354 and branch policy 40193357356 succeeded | Patch-only central package changes; candidate CI passed. This does not prove deployment or waive security review. |

These are existing GitHub results for each PR head, not newly executed tests of
this correction. A green build alone does not establish runtime support.

## Docker correction

The frontend currently declares `node: ^24.15.0 || >=26.0.0`; `.nvmrc` selects 24.
The Dockerfile nevertheless uses `node:25-alpine`. Use `node:24-alpine` to align
the build stage with existing development and CI configuration. Keep npm
`--ignore-scripts`, lockfile installation, .NET stages and the chiseled runtime.
Node is used only in the SPA build stage, not the final application runtime.

Official compatibility references, checked October 26, 2026:

- [Angular version compatibility](https://angular.dev/reference/versions)
- [Node release support status](https://nodejs.org/en/about/previous-releases)

Node's pages disagree on the precise historical Node 25 support cutoff; both
identify the release as EOL. No exact cutoff date is needed for this correction.

## Remaining verification

Docker is unavailable in the local environment. CI must build the API image and
smoke-test `/health/live` plus the bundled app as defined in `.github/workflows/ci.yml`.
Do not close #275 or claim full dependency acceptance until the correction and
remaining Actions review have completed. No merge, deployment, protection change,
or paid service is part of this work.
