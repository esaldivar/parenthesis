#!/usr/bin/env bash
# Checks that a pull request's source branch may merge into its target branch.
# Usage: check-pr-branch-policy.sh <base-ref> <head-ref> [<base-repo> <head-repo>]
# The repo arguments are "owner/name"; when given, PRs into main must come from this repository, not a fork.
# Policy (see CONTRIBUTING.md):
#   main    <- develop (a release) or hotfix/* only
#   develop <- design/*, feat/*, feature/*, fix/*, bugfix/*, hotfix/*, chore/*, docs/*
#   any other target: no policy (e.g. a PR stacked on a feature branch)
set -euo pipefail

base="${1:?base ref required}"
head="${2:?head ref required}"
base_repo="${3:-}"
head_repo="${4:-}"

fail() {
  echo "::error title=PR branch policy::$1"
  exit 1
}

case "$base" in
  main)
    if [[ -n "$base_repo" && "$head_repo" != "$base_repo" ]]; then
      fail "PRs into main must come from a branch in $base_repo, not from a fork ($head_repo:$head)."
    fi
    case "$head" in
      develop | hotfix/?*) echo "OK: $head -> main" ;;
      *) fail "PRs into main must come from develop (a release) or a hotfix/* branch (this one is from $head). Retarget the PR to develop." ;;
    esac
    ;;
  develop)
    case "$head" in
      design/?* | feat/?* | feature/?* | fix/?* | bugfix/?* | hotfix/?* | chore/?* | docs/?*)
        echo "OK: $head -> develop"
        ;;
      main)
        fail "Don't PR main straight into develop. Back-merge through a chore/sync-main branch instead (see CONTRIBUTING.md)."
        ;;
      *)
        fail "PRs into develop must come from a design/, feat/, feature/, fix/, bugfix/, hotfix/, chore/ or docs/ branch (this one is from $head). Rename the branch and open a new PR."
        ;;
    esac
    ;;
  *)
    echo "OK: no branch policy for PRs into $base"
    ;;
esac
