#!/usr/bin/env bash
# Checks that a pull request's source branch may merge into its target branch.
# Usage: check-pr-branch-policy.sh <base-ref> <head-ref> [<base-repo> <head-repo> <pr-number>]
set -euo pipefail

base="${1:?base ref required}"
head="${2:?head ref required}"
base_repo="${3:-}"
head_repo="${4:-}"
pr_number="${5:-}"

fail() {
  echo "::error title=PR branch policy::$1"
  exit 1
}

same_repo() {
  if [[ -n "$base_repo" && "$head_repo" != "$base_repo" ]]; then
    fail "PRs into $base must come from a branch in $base_repo, not from a fork ($head_repo:$head)."
  fi
}

release_re='^release/(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

case "$base" in
  main)
    same_repo
    case "$head" in
      develop | hotfix/?*) echo "OK: $head -> main" ;;
      *) fail "PRs into main must come from develop (a tested release) or a hotfix/* branch (this one is from $head)." ;;
    esac
    ;;
  develop)
    same_repo
    if [[ "$head" =~ $release_re ]]; then
      echo "OK: $head -> develop (release)"
      exit 0
    fi
    case "$head" in
      hotfix/?* | chore/sync-?*) echo "OK: $head -> develop" ;;
      feature/68-queue-controller)
        if [[ "$pr_number" == "77" ]]; then
          echo "OK: PR #77 one-off queue-controller exception into develop"
        else
          fail "Queue-controller exception applies only to PR #77."
        fi
        ;;
      main) fail "Don't PR main straight into develop. Back-merge through a chore/sync-main branch (see docs/development-workflow.md)." ;;
      *) fail "develop only accepts release/x.y.z, hotfix/* or chore/sync-* branches (this one is from $head). Target the active release/x.y.z branch instead." ;;
    esac
    ;;
  release/*)
    same_repo
    if [[ ! "$base" =~ $release_re ]]; then
      fail "Release branches are named release/x.y.z (this target is $base)."
    fi
    case "$head" in
      design/?* | feat/?* | feature/?* | fix/?* | bugfix/?* | chore/?* | docs/?* | hotfix/?* | dependabot/?*)
        echo "OK: $head -> $base"
        ;;
      *) fail "PRs into $base must come from a design/, feat/, feature/, fix/, bugfix/, chore/, docs/, hotfix/ or dependabot/ branch (this one is from $head)." ;;
    esac
    ;;
  *)
    echo "OK: no branch policy for PRs into $base"
    ;;
esac
