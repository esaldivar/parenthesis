#!/usr/bin/env bash
# Builds, starts and stops an isolated local Parenthesis candidate on a Mac for the real VoiceOver tests (#443).
# The Linux gate's start-release-candidate.sh needs Docker host networking, which Docker Desktop for Mac lacks, so
# this mirrors the Windows NVDA script instead: a private Postgres cluster, Mailpit and the published API serving the
# built Angular app over loopback HTTPS. Every account is synthetic; nothing touches a shared database or user-secrets.
#
# Usage (from tests/e2e):  scripts/macos-voiceover-candidate.sh build|start|stop|status
# Needs: dotnet (global.json SDK), node/npm, Homebrew postgresql@17 and mailpit, openssl, curl, lsof.
# Env:   VOICEOVER_CANDIDATE_DIR (default $TMPDIR/parenthesis-voiceover-candidate), PG_BIN (default: Homebrew's
#        postgresql@17 bin), APP_PORT 8443, POSTGRES_PORT 5433, MAIL_PORT 8025, SMTP_PORT 1025.
set -euo pipefail

action="${1:-}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
state="${VOICEOVER_CANDIDATE_DIR:-${TMPDIR:-/tmp}/parenthesis-voiceover-candidate}"
state="${state%/}"
app_port="${APP_PORT:-8443}"
pg_port="${POSTGRES_PORT:-5433}"
mail_port="${MAIL_PORT:-8025}"
smtp_port="${SMTP_PORT:-1025}"
marker="$state/owner.json"
app="$state/app"
pg_data="$state/pgdata"
logs="$state/logs"

fail() { echo "macos-voiceover-candidate: $*" >&2; exit 1; }

pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then echo "$PG_BIN"; return; fi
  command -v brew >/dev/null || fail 'Set PG_BIN, or install Homebrew postgresql@17.'
  echo "$(brew --prefix postgresql@17)/bin"
}

# The state directory is ours only if we created it; never reuse or delete someone else's folder.
own_state() {
  if [[ -e "$state" && ! -f "$marker" ]]; then fail "Refusing to use unowned directory $state."; fi
  mkdir -p "$logs"
  printf '{"schema":1,"directory":"%s"}\n' "$state" > "$marker"
}

require_owned() {
  [[ -f "$marker" ]] || fail 'Run build first.'
  grep -q "\"directory\":\"$state\"" "$marker" || fail 'Invalid candidate state ownership.'
}

port_free() {
  if lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then fail "Port $1 is already in use."; fi
}

head_sha() { git -C "$repo" rev-parse HEAD; }
head_tree() { git -C "$repo" rev-parse 'HEAD^{tree}'; }

# A process's start time, trimmed: macOS pads `ps -o lstart=` with a trailing space that `read` would drop.
started_at() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ //; s/ $//'; }

# Records a background process with its start time, so stop never kills a reused process ID.
record() {
  printf '%s %s\n' "$2" "$(started_at "$2")" > "$state/$1.pid"
}

stop_recorded() {
  local file="$state/$1.pid" pid started now
  [[ -f "$file" ]] || return 0
  read -r pid started < "$file"
  now="$(started_at "$pid" || true)"
  if [[ -n "$now" ]]; then
    # Report and carry on, so stop still shuts down the other processes and the database.
    if [[ "$now" != "$started" ]]; then echo "Refusing to stop reused process ID $pid ($1)." >&2; return 1; fi
    kill "$pid"
    for _ in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
  fi
  rm -f "$file"
}

wait_url() { # url expected-status pid
  local url="$1" expected="$2" pid="$3" code
  case "$url" in https://127.0.0.1:*|http://127.0.0.1:*) ;; *) fail 'Readiness checks must use loopback.' ;; esac
  for _ in $(seq 1 240); do
    kill -0 "$pid" 2>/dev/null || fail "Candidate process exited before $url was ready (see $logs)."
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)"
    [[ "$code" == "$expected" ]] && return 0
    sleep 0.25
  done
  fail "Candidate readiness failed: $url (expected $expected)."
}

# Sass's native compiler needs macOS 14+; on older macOS it fails and the Angular build hangs. Use the JS compiler.
sass_fallback() {
  if [[ "$(uname)" == Darwin && "$(sw_vers -productVersion | cut -d. -f1)" -lt 14 ]]; then export NG_BUILD_SASS_EMBEDDED=0; fi
}

build() {
  own_state
  sass_fallback
  rm -rf "$app"
  echo 'Publishing the API'
  dotnet publish "$repo/src/backend/CoParent.Api/CoParent.Api.csproj" -c Release --self-contained false \
    -p:UseAppHost=false -o "$app"
  echo 'Building the Angular website'
  (cd "$repo/src/frontend" && npm ci --ignore-scripts && npm run build)
  cp -R "$repo/src/frontend/dist/parenthesis/browser" "$app/wwwroot"
  printf '{"sha":"%s","tree":"%s"}\n' "$(head_sha)" "$(head_tree)" > "$app/candidate-source.json"
  echo "Built candidate $(head_sha) in $app"
}

start() {
  require_owned
  [[ "$(uname)" == Darwin ]] || fail 'This script is for macOS; Windows uses windows-nvda-candidate.ps1.'
  local ports="$app_port $pg_port $mail_port $smtp_port"
  [[ "$(tr ' ' '\n' <<< "$ports" | sort -u | wc -l | tr -d ' ')" == 4 ]] || fail 'Candidate ports must be distinct.'
  for port in $ports; do port_free "$port"; done
  [[ ! -e "$pg_data" ]] || fail 'Start needs a fresh database: run stop first.'
  grep -q "\"sha\":\"$(head_sha)\",\"tree\":\"$(head_tree)\"" "$app/candidate-source.json" \
    || fail 'The built candidate does not match this checkout: run build again.'
  local bin password
  bin="$(pg_bin)"
  password="$(openssl rand -hex 16)"
  umask 077
  printf '%s' "$password" > "$state/postgres-password.txt"
  "$bin/initdb" -D "$pg_data" -U e2e --auth=scram-sha-256 --pwfile="$state/postgres-password.txt" \
    --encoding=UTF8 --locale=C > "$logs/initdb.log"
  "$bin/pg_ctl" -D "$pg_data" -l "$logs/postgres.log" -o "-h 127.0.0.1 -p $pg_port -k $state" -w start > /dev/null
  PGPASSWORD="$password" "$bin/createdb" -h 127.0.0.1 -p "$pg_port" -U e2e coparent

  mailpit --listen "127.0.0.1:$mail_port" --smtp "127.0.0.1:$smtp_port" --database "$state/mailpit.db" \
    > "$logs/mailpit.log" 2>&1 &
  record mailpit $!
  wait_url "http://127.0.0.1:$mail_port/api/v1/info" 200 $!

  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
    -keyout "$state/key.pem" -out "$state/cert.pem" 2>/dev/null

  # This environment belongs to the candidate processes only, never user-secrets or production settings.
  export ConnectionStrings__Postgres="Host=127.0.0.1;Port=$pg_port;Database=coparent;Username=e2e;Password=$password"
  export ASPNETCORE_ENVIRONMENT=Production ASPNETCORE_URLS="https://127.0.0.1:$app_port" ASPNETCORE_HTTP_PORTS=
  export Kestrel__Certificates__Default__Path="$state/cert.pem" Kestrel__Certificates__Default__KeyPath="$state/key.pem"
  export App__PublicBaseUrl="https://localhost:$app_port"
  export Email__Smtp__Host=127.0.0.1 Email__Smtp__Port="$smtp_port" Email__Smtp__UseStartTls=false
  export Identity__AuthRateLimit__PermitLimit=1000 Logging__LogLevel__Default=Warning
  (cd "$app" && dotnet CoParent.Api.dll migrate > "$logs/migrations.log" 2>&1) || fail "Migrations failed (see $logs)."
  (cd "$app" && exec dotnet CoParent.Api.dll > "$logs/api.log" 2>&1) &
  local api=$!
  record api "$api"
  wait_url "https://127.0.0.1:$app_port/health/ready" 200 "$api"
  curl -sk "https://127.0.0.1:$app_port/sign-in" | grep -q '<app-root' || fail 'The candidate did not serve the Angular app.'
  wait_url "https://127.0.0.1:$app_port/api/antiforgery" 204 "$api"
  cat > "$logs/candidate.json" <<JSON
{
  "sourceSha": "$(head_sha)",
  "sourceTree": "$(head_tree)",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "macos": "$(sw_vers -productVersion) ($(sw_vers -buildVersion))",
  "arch": "$(uname -m)",
  "postgres": "$("$bin/postgres" --version)",
  "mailpit": "$(mailpit version 2>/dev/null | head -1)",
  "dotnet": "$(dotnet --version)",
  "node": "$(node --version)",
  "appUrl": "https://localhost:$app_port",
  "mailpitUrl": "http://127.0.0.1:$mail_port"
}
JSON
  echo "Candidate ready at https://localhost:$app_port ($(head_sha))."
}

stop() {
  [[ -f "$marker" ]] || return 0
  require_owned
  local failures=0
  stop_recorded api || failures=1
  stop_recorded mailpit || failures=1
  if [[ -f "$pg_data/postmaster.pid" ]]; then "$(pg_bin)/pg_ctl" -D "$pg_data" -m fast -w stop > /dev/null || failures=1; fi
  # The database and mailbox are disposable: the next start needs a fresh cluster.
  rm -rf "$pg_data" "$state/mailpit.db" "$state/postgres-password.txt" "$state/key.pem" "$state/cert.pem"
  [[ "$failures" == 0 ]] || fail 'Some candidate processes did not stop cleanly.'
  echo 'Candidate stopped.'
}

status() {
  for name in api mailpit; do
    if [[ -f "$state/$name.pid" ]]; then echo "$name: $(cat "$state/$name.pid")"; else echo "$name: not running"; fi
  done
}

case "$action" in
  build) build ;;
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) fail 'Usage: macos-voiceover-candidate.sh build|start|stop|status' ;;
esac
