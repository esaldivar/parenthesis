#!/usr/bin/env bash
# Works out what a push to main should deploy to production (docs/development-workflow.md).
# Usage: production-plan.sh <image-repo>   (run in a full clone, at the main commit; release/* branches fetched)
# IMAGE_EXISTS_CMD (optional) replaces "docker manifest inspect" to check whether an image tag exists (for tests).
# Prints image=, tested_sha=, version=, kind= (release | build-hotfix) for $GITHUB_OUTPUT; exits 1 with an error
# when main can't be deployed safely.
set -euo pipefail
image="${1:?image repo required}"
exists() { ${IMAGE_EXISTS_CMD:-docker manifest inspect} "$1" >/dev/null 2>&1; }
err() { echo "::error::$1" >&2; exit 1; }

head="$(git rev-parse HEAD)"
parent="$(git rev-parse --verify -q HEAD^2 || true)"
[[ -n "$parent" ]] || err "main's head isn't a merge commit. Releases reach main through a PR merged with a merge commit."
if ! git diff --quiet "$parent" HEAD; then
  git diff --stat "$parent" HEAD >&2
  err "main holds changes that $parent (the commit that was merged) doesn't. Back-merge main into develop, retest, and release again."
fi

last="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)"
if exists "$image:sha-$parent"; then
  # A release: the highest release/x.y.z branch that main now contains and that isn't tagged yet.
  version=""
  for b in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/release/' | grep -E '^origin/release/[0-9]+\.[0-9]+\.[0-9]+$' | sort -t/ -k3 -Vr); do
    v="v${b#origin/release/}"
    if git merge-base --is-ancestor "$b" HEAD && ! git rev-parse -q --verify "refs/tags/$v" >/dev/null; then version="$v"; break; fi
  done
  [[ -n "$version" ]] || err "No untagged release/x.y.z branch is contained in main. Was the release merged into develop with a merge commit?"
  echo "image=$image:sha-$parent"; echo "tested_sha=$parent"; echo "version=$version"; echo "kind=release"
elif git rev-parse -q --verify refs/remotes/origin/develop >/dev/null && git merge-base --is-ancestor "$parent" refs/remotes/origin/develop; then
  err "$parent is on develop but has no image yet. Wait for its development deployment to finish, then re-run this workflow."
else
  # A hotfix: no development-tested image exists, so one is built from main. Patch version bump.
  [[ -n "$last" ]] || err "The merged commit has no development-tested image, and there's no released version to hotfix."
  IFS=. read -r major minor patch <<<"${last#v}"
  echo "image=$image:sha-$head"; echo "tested_sha=$head"; echo "version=v$major.$minor.$((patch + 1))"; echo "kind=build-hotfix"
fi
