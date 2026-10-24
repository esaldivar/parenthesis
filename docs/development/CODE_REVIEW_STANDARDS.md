# Parenthesis — Pull Request and Code Review Standards

Status: repository-wide development policy. This document describes agreed standards; it does not assert that all automated enforcement is active.

## 1. Tracking issues
Every PR must include a **Tracking issues** section referencing one or more real issues in this repository, using non-closing `Refs #123` syntax for intermediate branches and release rollups. References to nonexistent issues, PR numbers, placeholders, or unrelated repositories are not valid. Follow [issue #132](https://github.com/esaldivar/parenthesis/issues/132) for verification and rollout. A linked issue is not automatically closed merely because intermediate work merges.

## 2. Milestones and ownership
Assign issues an appropriate owner and release milestone when applicable. PR milestones should inherit from verified tracking issues, using the GitHub milestone field as the source of truth. When multiple issues disagree, report the conflict rather than guessing. Repository-wide governance and other documented exceptions may intentionally have no milestone. See [#140](https://github.com/esaldivar/parenthesis/issues/140). For this governance document, no milestone is required.

## 3. Review checklist
Before requesting review, verify:
- Scope matches the linked issue, requirements, acceptance criteria, and existing architecture/design decisions.
- Changes are tested; applicable backend build, formatting, tests, frontend lint, tests and production build are successful.
- Authentication, authorization, secrets, child/family data boundaries, error handling, and concurrency are reviewed where relevant.
- Schema migrations, destructive changes, and API compatibility are checked where relevant.
- Copilot and human review findings are addressed or explicitly documented before release readiness is claimed.
- The PR description explains the change, verification performed, risks, and any exceptions.

## 4. Risk-based review
Use informational labels such as `security-review`, `database-change`, `breaking-change`, and `high-risk` based on changed files and verified issue context. Sensitive operations, especially account deletion and family data authorization, warrant additional scrutiny. Labels must not be treated as an enforceable security boundary. See [#141](https://github.com/esaldivar/parenthesis/issues/141).

## 5. Automation and approvals
New milestone and risk-audit automation for v0.3.0 begins in non-blocking/report-only mode. Test on real PRs before enabling automatic changes or required status checks. Do not enable new blocking gates without separate owner approval. Preserve existing branch protections, Copilot reviews, and Claude queue approval requirements; Claude development and PR creation require their respective explicit approvals under [#68](https://github.com/esaldivar/parenthesis/issues/68).

## 6. Branch and release workflow
Follow [CONTRIBUTING.md](../../CONTRIBUTING.md) and [development workflow](../development-workflow.md). Work branches are created from the active `release/x.y.z` branch and PRs target that release branch. Tested milestone releases then flow through a release PR into `develop`; production changes reach `main` only via the documented release or hotfix process. No direct pushes to protected branches. Release rollups, backports, and hotfix syncs require appropriate issue references and documented exceptions.

## 7. Enforcement status
A written standard is not proof of CI enforcement. Before calling a rule enforced, verify its workflow, successful runs, and relevant repository branch rulesets. Do not disable or replace existing protections as part of rollout.

## 8. Documentation changes
Changes to these standards must use a PR, cite the applicable tracking issue, and be reviewed against existing policy. Policy changes that introduce mandatory gates require explicit owner approval.
