# Required PR tracking issues

Every PR must list **all relevant tracking issues** under exactly one `## Tracking issues` heading in its body.
Use one plain-text `Refs #132` line per issue, optionally bulleted. Full same-repository issue URLs also work.
Comments, code examples, placeholders, other repositories and PR references do not count. Each reference is
verified through GitHub's API, including the distinction between an issue and a PR. Missing or inaccessible
metadata fails closed. Up to 100 unique issues are supported.

## Features, promotions and existing PRs

- Features, documentation, CI changes and hotfixes list the issue that actually tracks their scope.
- Release rollups, promotions and syncs list the underlying issues or a real release checklist issue tracking
  the rollup. Closed issues are allowed, because earlier work can already be complete. Reviewers still check
  that the list is relevant and complete: an API can establish existence, not semantic relevance.
- Use **Refs**, rather than Closes/Fixes/Resolves, for work into `release/*`, development deployments and
  hotfix back-merges. Only use a closing keyword on the final promotion if all issue acceptance criteria are
  met. A valid reference never itself authorizes closing an issue, a PR, a merge or a deployment.
- Existing open PRs are subject to the same rule after activation. Their authors must edit their bodies to
  identify the actual tracking issues. Do not rewrite old merged PRs or invent unrelated issues. In particular,
  a PR whose only reference is another PR needs its real issue identified by its author before it can pass.
- Bots also need a real maintenance issue. There is no label, branch or author exemption.

## Security and check behavior

The **Tracking issue links** job uses `pull_request_target` with read-only contents, issues and PR permissions.
It checks out only `.github/scripts` from the event's trusted **default-branch SHA**, never the PR head. It runs on opened,
reopened, synchronize, edited and ready-for-review events, including drafts. PR text never becomes shell code.
It reads the live PR body, verifies every listed issue and rechecks the body/head/base at the end. Redirects and
API errors fail closed. It never writes issues, PRs, project statuses, secrets or deployments.

Body edits trigger a new check; concurrency cancels older runs. An author can race a body edit after any check
finishes, and GitHub status checks are associated with commits, not immutable PR descriptions. Reviewers must
still confirm the current body before merging. Issue deletion/transfer after a successful check also requires
a rerun. This check does not claim to prove acceptance, semantic relevance, complete release scope or deployment.

## Activation (owner-controlled merges first)

1. Review this PR and get explicit owner merge approval. The checker is validated by the normal **Workflow script
   tests** job, but its trusted policy workflow does not yet exist on the default branch.
2. Get the exact reviewed workflow and checker onto **default branch main** through owner-approved merges. This
   may use the normal approved release sequence or a separately reviewed automation-only hotfix from main; do not
   promote unrelated application changes merely to activate this check. No main merge or deployment is authorized
   by publishing this draft. GitHub now takes pull_request_target workflows from the default branch regardless
   of PR target; merging only into release/* or develop does not activate this workflow.
3. Once main contains it, open/edit a legitimate PR for each protected target and verify **Tracking issue links**
   passes with real links and fails when those links are removed or invalid. Restore correct links before merge.
4. In Settings → Rules → Rulesets, add **Tracking issue links** (GitHub Actions) to the existing `release/*`
   required checks. In Settings → Branches, add it to existing main/develop required checks. Preserve all checks,
   strict/up-to-date settings, branch patterns, bypass restrictions and review rules. Do not enable it before
   step 3; an absent required check would block bootstrap. The default-branch policy applies uniformly to PR targets.
5. Recheck all open PRs and the settings API to confirm the context is required for `main`, `develop` and
   `release/*`. Until the trusted workflow is present and the rule is verified for a target, describe that target
   as **not enforced**. Future release branches inherit the ruleset and must contain the workflow.

GitHub's current trust model: [Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
The existing local board synchronizer recognizes closing keywords, not the new non-closing Refs section. Human
acceptance/deployment verification remains necessary; this PR does not broaden that synchronizer's auto-close behavior.

Do not add a dummy successful check or push directly to a protected branch to bootstrap. Owner approval for
merges and production deployments remains required. No unrelated Claude execution is activated by this change.

## Troubleshooting

Add or correct the explicit section and edit the body to rerun. For API availability or stale-event failures,
rerun the latest event after checking GitHub availability and the job's read permissions. Private issues this
workflow cannot read cannot be used to satisfy this repository-local rule. No extra Project token is required:
the read-only `github.token` is sufficient. Never paste tokens into issue or PR text.
