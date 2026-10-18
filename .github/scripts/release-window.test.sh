#!/usr/bin/env bash
# Tests for release-window.sh. Run: bash .github/scripts/release-window.test.sh
set -uo pipefail
dir="$(dirname "$0")"
config="$dir/../release-windows.json"
failures=0

expect() { # expect <date> <phase> <window> [<holiday>] [<config>]
  local out want="phase=$2 window=$3 holiday=${4:-false}"
  out="$(bash "$dir/release-window.sh" "${5:-$config}" "$1" | grep -v '^next=' | tr '\n' ' ' | sed 's/ $//')"
  if [[ "$out" == "$want" ]]; then echo "ok   $1: $out"; else echo "FAIL $1: got '$out', want '$want'"; failures=$((failures + 1)); fi
}
expect_next() { # expect_next <date> <next>
  local got; got="$(bash "$dir/release-window.sh" "$config" "$1" | sed -n 's/^next=//p')"
  if [[ "$got" == "$2" ]]; then echo "ok   $1: next=$got"; else echo "FAIL $1: next=$got, want $2"; failures=$((failures + 1)); fi
}

# First window, Friday October 30, 2026.
expect 2026-10-26 release-pr 2026-10-30
expect 2026-10-29 readiness 2026-10-30
expect 2026-10-30 release 2026-10-30
expect 2026-10-27 none ""
expect 2026-10-23 none ""
expect 2026-10-18 none ""
expect_next 2026-10-18 2026-10-30
# Next ones every 14 days.
expect 2026-11-12 readiness 2026-11-13
expect 2026-11-13 release 2026-11-13
expect 2026-11-20 none ""
# Moved for Thanksgiving: Wednesday November 25 (readiness Tuesday, release PR Monday).
expect 2026-11-23 release-pr 2026-11-25
expect 2026-11-24 readiness 2026-11-25
expect 2026-11-25 release 2026-11-25
expect 2026-11-27 none ""
expect_next 2026-11-14 2026-11-25
# Moved for Christmas: Wednesday December 23.
expect 2026-12-21 release-pr 2026-12-23
expect 2026-12-22 readiness 2026-12-23
expect 2026-12-23 release 2026-12-23
expect 2026-12-25 none ""
# Then back to Fridays: January 8, 2027.
expect 2027-01-08 release 2027-01-08
expect_next 2026-12-24 2027-01-08
# Holidays that aren't moved yet are flagged: November 26, 2027 is the day after Thanksgiving.
expect 2027-11-26 release 2027-11-26 true
expect 2027-11-25 readiness 2027-11-26 true

# A skipped window produces nothing.
tmp="$(mktemp)"; jq '.skipped = ["2026-11-13"]' "$config" > "$tmp"
expect 2026-11-13 none "" false "$tmp"
expect 2026-11-12 none "" false "$tmp"
rm -f "$tmp"

if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "All release-window tests passed"
