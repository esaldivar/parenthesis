#!/usr/bin/env bash
# Tests for check-pr-branch-policy.sh. Run: bash .github/scripts/check-pr-branch-policy.test.sh
set -uo pipefail

script="$(dirname "$0")/check-pr-branch-policy.sh"
repo="esaldivar/parenthesis"
failures=0

expect() {
  local want="$1"; shift
  local got output
  if output="$(bash "$script" "$@" 2>&1)"; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $want: ${2} -> ${1}"
  else
    echo "FAIL expected $want, got $got: ${2} -> ${1}"; echo "     $output"
    failures=$((failures + 1))
  fi
}

# Main still accepts only production promotions and hotfixes.
expect pass main develop "$repo" "$repo"
expect pass main hotfix/login-crash "$repo" "$repo"
expect fail main dependabot/github_actions/actions-79bcc16f55 "$repo" "$repo"

# Develop only accepts releases and authorized hotfix propagation.
expect pass develop release/0.3.0 "$repo" "$repo"
expect fail develop dependabot/nuget/x "$repo" "$repo"

# Release branches accept work and Dependabot updates from this repository only.
expect pass release/0.3.0 dependabot/github_actions/actions-79bcc16f55 "$repo" "$repo"
expect pass release/0.3.0 dependabot/docker/docker-node-25-alpine "$repo" "$repo"
expect fail release/0.3.0 dependabot/ "$repo" "$repo"
expect fail release/0.3.0 dependabot/nuget/x "$repo" "someone/parenthesis"
expect fail release/next dependabot/nuget/x "$repo" "$repo"

if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "All branch-policy tests passed"
