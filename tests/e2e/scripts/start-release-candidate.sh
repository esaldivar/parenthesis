#!/usr/bin/env bash
# Starts the release candidate's API image for the Playwright release gate, against the job's own Postgres and
# Mailpit (service containers on localhost) and a throwaway Azurite blob emulator for event photos (#403). Nothing here is shared or long-lived: the database, the mailbox and the
# certificate exist only for this run, and every account is synthetic.
#
# Usage: start-release-candidate.sh <image>
# Env:   POSTGRES_CONNECTION (default: the job's Postgres service), CERT_DIR (default: $RUNNER_TEMP/e2e-tls).
set -euo pipefail

image="${1:?usage: start-release-candidate.sh <image>}"
cert_dir="${CERT_DIR:-${RUNNER_TEMP:-/tmp}/e2e-tls}"
postgres="${POSTGRES_CONNECTION:-Host=localhost;Port=5432;Database=coparent;Username=e2e;Password=e2e}"

# The app only works over HTTPS (Secure, __Host- cookies), so the test instance gets a throwaway self-signed
# certificate. It's readable by the image's non-root user and is discarded with the runner.
mkdir -p "$cert_dir"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout "$cert_dir/key.pem" -out "$cert_dir/cert.pem" 2>/dev/null
chmod 644 "$cert_dir/key.pem" "$cert_dir/cert.pem"

common=(
  --network host
  -e "ConnectionStrings__Postgres=$postgres"
  -e ASPNETCORE_ENVIRONMENT=Production
)

# Event photos go to a local blob emulator, never Azure. It's started here, not as a service container, because it
# needs its own command line. The API creates the private container on first upload.
echo "Starting the blob emulator"
docker run -d --name azurite --network host mcr.microsoft.com/azure-storage/azurite:3.37.0 \
  azurite-blob --blobHost 127.0.0.1 --blobPort 10000 --skipApiVersionCheck --loose >/dev/null

echo "Applying migrations"
docker run --rm "${common[@]}" "$image" migrate

echo "Starting the API"
docker run -d --name api "${common[@]}" \
  -v "$cert_dir:/tls:ro" \
  -e ASPNETCORE_HTTP_PORTS= \
  -e ASPNETCORE_URLS=https://+:8443 \
  -e Kestrel__Certificates__Default__Path=/tls/cert.pem \
  -e Kestrel__Certificates__Default__KeyPath=/tls/key.pem \
  -e App__PublicBaseUrl=https://localhost:8443 \
  -e Email__Smtp__Host=localhost \
  -e Email__Smtp__Port=1025 \
  -e Email__Smtp__UseStartTls=false \
  -e Identity__AuthRateLimit__PermitLimit=1000 \
  -e EventPhotos__ConnectionString=UseDevelopmentStorage=true \
  -e EventPhotos__UploadsEnabled=true \
  "$image" >/dev/null

for _ in $(seq 1 60); do
  if curl -fsk https://localhost:8443/health/ready >/dev/null 2>&1; then
    echo "Release candidate is ready at https://localhost:8443"
    exit 0
  fi
  sleep 1
done

echo "::error::The release candidate didn't become ready within 60 seconds."
docker logs api
exit 1
