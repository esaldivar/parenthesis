#!/usr/bin/env bash
# Says where a date falls in the two-week release cycle.
# Usage: release-window.sh <config.json> [<YYYY-MM-DD>]   (date defaults to today in the config's time zone)
# Prints key=value lines for $GITHUB_OUTPUT:
#   phase   = release-pr (Monday of release week: open release/x.y.z -> develop)
#           | readiness  (the day before the window: readiness review and owner approval request)
#           | release    (the window itself: promote develop -> main if approved)
#           | none
#   window  = the window date the phase belongs to (empty for none)
#   holiday = true when that window is on a date listed in "holidays" (flag it for the owner)
#   next    = the next window on or after the date
set -euo pipefail

config="${1:?config file required}"
tz="$(jq -r '.timezone' "$config")"
today="${2:-$(TZ="$tz" date +%F)}"
anchor="$(jq -r '.anchor' "$config")"
interval="$(jq -r '.intervalDays' "$config")"

day() { date -u -d "$1" +%s; }         # midnight UTC of a date, in seconds
shift_days() { date -u -d "$1 $2 days" +%F; }
actual() { # the date a scheduled window really happens, or empty if skipped
  local s="$1"
  if jq -e --arg d "$s" '.skipped | index($d)' "$config" >/dev/null; then return 0; fi
  jq -r --arg d "$s" '.moved[$d] // $d' "$config"
}

t=$(day "$today")
a=$(day "$anchor")
k=$(( (t - a) / 86400 / interval ))
(( t < a )) && k=0

phase=none window="" next=""
for i in $((k - 1)) $k $((k + 1)) $((k + 2)); do
  (( i < 0 )) && continue
  scheduled=$(shift_days "$anchor" $((i * interval)))
  w=$(actual "$scheduled")
  [[ -z "$w" ]] && continue
  if [[ -z "$next" && $(day "$w") -ge $t ]]; then next="$w"; fi
  dow=$(date -u -d "$w" +%u)                 # 1 = Monday
  monday=$(shift_days "$w" $((1 - dow)))
  eve=$(shift_days "$w" -1)
  if [[ "$today" == "$w" ]]; then phase=release window="$w"
  elif [[ "$today" == "$eve" ]]; then phase=readiness window="$w"
  elif [[ "$today" == "$monday" ]]; then phase=release-pr window="$w"
  fi
done

holiday=false
if [[ -n "$window" ]] && jq -e --arg d "$window" '.holidays | index($d)' "$config" >/dev/null; then holiday=true; fi
echo "phase=$phase"
echo "window=$window"
echo "holiday=$holiday"
echo "next=$next"
