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
expect fail main release/0.2.0 "$repo" "$repo"
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
expect fail main develop-old "$repo" "$repo"
expect fail main my/develop "$repo" "$repo"
expect fail main develop "$repo" "someone/parenthesis"
expect fail main hotfix/x "$repo" "someone/parenthesis"

# Into develop: only tested releases and hotfix propagation.
for head in release/0.2.0 release/1.10.3 hotfix/x chore/sync-main chore/sync-main-2026-10-30; do
  expect pass develop "$head" "$repo" "$repo"
done
expect pass develop feature/68-queue-controller "$repo" "$repo" 77
expect fail develop feature/68-queue-controller "$repo" "$repo" 78
expect fail develop feature/68-queue-controller "$repo" "$repo"
expect fail develop feature/68-queue-controller "$repo" "someone/parenthesis" 77
for head in design/signup-invitations-profile-picker feat/x feature/request-expiry fix/ci-pr-branch-policy \
            bugfix/x chore/x docs/x release/0.2 release/v0.2.0 release/0.02.0 release/ main develop random-branch \
            Feat/x ci/x dependabot/nuget/x chore/release-workflow; do
  expect fail develop "$head" "$repo" "$repo"
done
expect fail develop release/0.2.0 "$repo" "someone/parenthesis"

# Into a release branch: work branches from this repository.
for head in design/x feat/x feature/parent-registration fix/x bugfix/child-pin-validation chore/x docs/x hotfix/x; do
  expect pass release/0.2.0 "$head" "$repo" "$repo"
done
for head in develop main release/0.3.0 random-branch feature/ ci/x dependabot/nuget/x; do
  expect fail release/0.2.0 "$head" "$repo" "$repo"
done
expect fail release/0.2.0 feature/x "$repo" "someone/parenthesis"
expect fail release/next feature/x "$repo" "$repo"

# Other targets (stacked PRs) have no policy.
expect pass feat/angular-shell docs/x "$repo" "$repo"

# Missing arguments are an error, not a pass.
expect fail "" ""

if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "All branch-policy tests passed"
