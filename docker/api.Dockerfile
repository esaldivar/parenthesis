# API image, serving the Angular app from the same origin (ADR-0004). Build from the repo root:
#   docker build -f docker/api.Dockerfile -t parenthesis-api .

# 1. Angular app
# Match src/frontend/.nvmrc and the frontend engine range; Node 25 is unsupported.
FROM node:24-alpine AS spa
WORKDIR /spa
COPY src/frontend/package.json src/frontend/package-lock.json ./
# --ignore-scripts: no dependency install scripts run (issue #65). The build doesn't need them: esbuild and
# @parcel/watcher use their prebuilt platform packages. The build uses the Angular CLI pinned in the lockfile.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src/frontend/ ./
RUN npm run build

# 2. API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Precompiled (ReadyToRun) for the target platform, so a cold start after scaling to zero JIT-compiles far less (#415).
# Publishing for one runtime also leaves out other platforms' native libraries: the app folder drops from about 490 MB
# to about 70 MB, which the replica pulls on a cold start. BuildKit sets TARGETARCH (amd64 on Azure, arm64 on Apple
# silicon).
ARG TARGETARCH
RUN case "$TARGETARCH" in arm64) echo linux-arm64 ;; *) echo linux-x64 ;; esac > /tmp/rid

# Restore first so the layer is cached until a project or package version changes.
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/backend/CoParent.Api/CoParent.Api.csproj src/backend/CoParent.Api/
COPY src/backend/CoParent.SharedKernel/CoParent.SharedKernel.csproj src/backend/CoParent.SharedKernel/
COPY src/backend/CoParent.Infrastructure/CoParent.Infrastructure.csproj src/backend/CoParent.Infrastructure/
COPY src/backend/Modules/CoParent.Modules.Identity/CoParent.Modules.Identity.csproj src/backend/Modules/CoParent.Modules.Identity/
COPY src/backend/Modules/CoParent.Modules.Families/CoParent.Modules.Families.csproj src/backend/Modules/CoParent.Modules.Families/
COPY src/backend/Modules/CoParent.Modules.Approvals/CoParent.Modules.Approvals.csproj src/backend/Modules/CoParent.Modules.Approvals/
COPY src/backend/Modules/CoParent.Modules.Calendar/CoParent.Modules.Calendar.csproj src/backend/Modules/CoParent.Modules.Calendar/
COPY src/backend/Modules/CoParent.Modules.Memories/CoParent.Modules.Memories.csproj src/backend/Modules/CoParent.Modules.Memories/
COPY src/backend/Modules/CoParent.Modules.Messaging/CoParent.Modules.Messaging.csproj src/backend/Modules/CoParent.Modules.Messaging/
COPY src/backend/Modules/CoParent.Modules.SharedRecords/CoParent.Modules.SharedRecords.csproj src/backend/Modules/CoParent.Modules.SharedRecords/
RUN dotnet restore src/backend/CoParent.Api/CoParent.Api.csproj -r "$(cat /tmp/rid)" -p:PublishReadyToRun=true

COPY .editorconfig ./
COPY src/backend/ src/backend/
COPY src/frontend/public/brand/parenthesis-icon.svg src/frontend/public/brand/parenthesis-icon.svg
RUN dotnet publish src/backend/CoParent.Api/CoParent.Api.csproj -c Release --no-restore -o /app \
    -r "$(cat /tmp/rid)" --self-contained false -p:PublishReadyToRun=true

# 3. Runtime. Chiseled: no shell or package manager, runs as a non-root user by default.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /app ./
COPY --from=spa /spa/dist/parenthesis/browser ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "CoParent.Api.dll"]
