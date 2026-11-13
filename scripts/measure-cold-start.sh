#!/usr/bin/env bash
# Times a cold and a warm start of a deployed Parenthesis site (#415), with no sign-in and no family data: only the
# public health check, the app shell and the app's main file. Run it after the site has been idle for at least 10
# minutes, so the first request wakes the container. See docs/runbooks/calendar-load-timing.md.
#
# Usage: scripts/measure-cold-start.sh [base-url] [warm-runs]
#        scripts/measure-cold-start.sh https://dev.parenthesisfamily.com 5
set -euo pipefail

base="${1:-https://dev.parenthesisfamily.com}"
runs="${2:-5}"
base="${base%/}"

timing() {
  # Seconds to first byte and in total, the bytes downloaded, and the server's own Server-Timing header.
  local url="$1" encoding="${2:-}"
  local headers
  headers="$(mktemp)"
  local result
  result="$(curl -sS -o /dev/null -D "$headers" --max-time 120 ${encoding:+-H "Accept-Encoding: $encoding"} \
    -w '%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}' "$url")"
  local server
  server="$(grep -i '^server-timing:' "$headers" | cut -d' ' -f2- | tr -d '\r' || true)"
  rm -f "$headers"
  echo "$result ${server:+server-timing=[$server]}"
}

echo "Cold start (the first request after the site has been idle):"
echo "  /health/ready  $(timing "$base/health/ready")"
echo

echo "Warm, $runs runs each:"
for i in $(seq 1 "$runs"); do
  echo "  run $i /health/ready  $(timing "$base/health/ready")"
done
echo

shell="$(curl -sS "$base/")"
main="$(printf '%s' "$shell" | grep -oE 'main-[A-Za-z0-9_-]+\.js' | head -n 1 || true)"
if [[ -n "$main" ]]; then
  echo "The app's main file ($main):"
  echo "  uncompressed  $(timing "$base/$main" identity)"
  echo "  compressed    $(timing "$base/$main" 'br, gzip')"
fi
