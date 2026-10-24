#!/usr/bin/env bash
# Tests for production-plan.sh against a throwaway git repository. Run: bash .github/scripts/production-plan.test.sh
set -uo pipefail
script="$(cd "$(dirname "$0")" && pwd)/production-plan.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.test GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.test
failures=0
built="$work/built"; : > "$built"     # image tags that "exist"
fake_exists() { grep -qxF "$1" "$built"; }
export -f fake_exists; export built; export IMAGE_EXISTS_CMD=fake_exists

cd "$work" && git init -q -b main origin.git >/dev/null && cd origin.git || exit 1
c() { echo "$1" > "$1.txt"; git add "$1.txt"; git commit -qm "$1"; }
push_release() { git update-ref "refs/remotes/origin/$1" "$(git rev-parse "$1")"; }
plan() { bash "$script" img 2>&1; }
expect() { # expect <description> <pattern>
  local out; out="$(plan)"
  if grep -qE "$2" <<<"$out"; then echo "ok   $1"; else echo "FAIL $1: $out"; failures=$((failures + 1)); fi
}

c base; git tag v0.1.0
git checkout -qb develop; git checkout -qb release/0.2.0; c feature-a; push_release release/0.2.0
git checkout -q develop; git merge -q --no-ff release/0.2.0 -m "release 0.2.0"; dev="$(git rev-parse HEAD)"
echo "img:sha-$dev" >> "$built"
git checkout -q main; git merge -q --no-ff develop -m "promote"
expect "release: deploys develop's tested image" "image=img:sha-$dev"
expect "release: version from the release branch" "version=v0.2.0"
expect "release: kind" "kind=release"
git update-ref refs/remotes/origin/develop "$dev"
sed -i "/img:sha-$dev/d" "$built"
expect "develop's image not built yet: refused, not treated as a hotfix" "has no image yet"
echo "img:sha-$dev" >> "$built"

git tag v0.2.0
git checkout -qb hotfix/x; c fix; git checkout -q main; git merge -q --no-ff hotfix/x -m "hotfix"
expect "hotfix: builds from main" "kind=build-hotfix"
expect "hotfix: patch bump" "version=v0.2.1"

c direct-commit
expect "a non-merge head is refused" "isn't a merge commit"

# main holding something the merged branch doesn't: merge an old branch that lacks main's latest commit.
git checkout -qb stale v0.2.0; echo x > other.txt; git add other.txt; git commit -qm stale
git checkout -q main; git merge -q --no-ff stale -m "stale"
echo "img:sha-$(git rev-parse HEAD^2)" >> "$built"
expect "main with untested changes is refused" "holds changes"

# A tested image but every contained release is already tagged: refuse rather than guess a version.
git checkout -q develop; git merge -q --no-ff main -m "back-merge"; d2="$(git rev-parse HEAD)"; echo "img:sha-$d2" >> "$built"
git checkout -q main; git merge -q --no-ff develop -m "promote again"
expect "no untagged release is refused" "No untagged release"

if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "All production-plan tests passed"
