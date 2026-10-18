#!/usr/bin/env bash
# Tests for check-pr-branch-policy.sh. Run: bash .github/scripts/check-pr-branch-policy.test.sh
set -uo pipefail

script="$(dirname "$0")/check-pr-branch-policy.sh"
repo="esaldivar/parenthesis"
failures=0

expect() { # expect <pass|fail> <base> <head> [<base-repo> <head-repo>]
  local want="$1"; shift
  local got output
  if output="$(bash "$script" "$@" 2>&1)"; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $want: ${2} -> ${1} ${4:+($4)}"
  else
    echo "FAIL expected $want, got $got: ${2} -> ${1} ${4:+($4)}"; echo "     $output"
    failures=$((failures + 1))
  fi
}

# Into main: develop and hotfix/* only, from this repository.
expect pass main develop "$repo" "$repo"
expect pass main hotfix/login-crash "$repo" "$repo"
expect pass main develop
expect fail main design/signup-invitations-profile-picker "$repo" "$repo"
expect fail main feat/x "$repo" "$repo"
expect fail main feature/x "$repo" "$repo"
expect fail main fix/x "$repo" "$repo"
expect fail main chore/sync-main "$repo" "$repo"
expect fail main docs/x "$repo" "$repo"
expect fail main hotfix/ "$repo" "$repo"
expect fail main hotfix "$repo" "$repo"
expect fail main release/0.3.0 "$repo" "$repo"
expect fail main develop-old "$repo" "$repo"
expect fail main my/develop "$repo" "$repo"
expect fail main develop "$repo" "someone/parenthesis"
expect fail main hotfix/x "$repo" "someone/parenthesis"

# Into develop: release branches (gated by Playwright), plus the work-branch prefixes.
for head in release/0.3.0 release/m3-calendar design/signup-invitations-profile-picker feat/x feature/request-expiry fix/ci-pr-branch-policy \
            bugfix/x hotfix/x chore/sync-main docs/m2-architecture; do
  expect pass develop "$head" "$repo" "$repo"
done
expect fail develop main "$repo" "$repo"
expect fail develop develop "$repo" "$repo"
expect fail develop random-branch "$repo" "$repo"
expect fail develop design/ "$repo" "$repo"
expect fail develop Feat/x "$repo" "$repo"
expect fail develop ci/x "$repo" "$repo"
expect fail develop dependabot/nuget/x "$repo" "$repo"
expect fail develop release/ "$repo" "$repo"
expect fail develop Release/0.3.0 "$repo" "$repo"

# Into a release branch: develop (to bring it up to date) and the work-branch prefixes.
for head in develop feature/shared-calendar feat/x fix/x bugfix/x chore/x docs/x design/x; do
  expect pass release/0.3.0 "$head" "$repo" "$repo"
done
expect fail release/0.3.0 main "$repo" "$repo"
expect fail release/0.3.0 hotfix/x "$repo" "$repo"
expect fail release/0.3.0 release/0.2.0 "$repo" "$repo"
expect fail release/0.3.0 random-branch "$repo" "$repo"

# Other targets (stacked PRs) have no policy.
expect pass feat/angular-shell docs/x "$repo" "$repo"

# Missing arguments are an error, not a pass.
expect fail "" ""

if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "All branch-policy tests passed"
