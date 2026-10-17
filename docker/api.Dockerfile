# API image, serving the Angular app from the same origin (ADR-0004). Build from the repo root:
#   docker build -f docker/api.Dockerfile -t parenthesis-api .

# 1. Angular app
FROM node:24-alpine AS spa
WORKDIR /spa
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/frontend/ ./
RUN npx ng build

# 2. API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first so the layer is cached until a project or package version changes.
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/backend/CoParent.Api/CoParent.Api.csproj src/backend/CoParent.Api/
COPY src/backend/CoParent.SharedKernel/CoParent.SharedKernel.csproj src/backend/CoParent.SharedKernel/
COPY src/backend/CoParent.Infrastructure/CoParent.Infrastructure.csproj src/backend/CoParent.Infrastructure/
COPY src/backend/Modules/CoParent.Modules.Identity/CoParent.Modules.Identity.csproj src/backend/Modules/CoParent.Modules.Identity/
COPY src/backend/Modules/CoParent.Modules.Families/CoParent.Modules.Families.csproj src/backend/Modules/CoParent.Modules.Families/
RUN dotnet restore src/backend/CoParent.Api/CoParent.Api.csproj

COPY .editorconfig ./
COPY src/backend/ src/backend/
RUN dotnet publish src/backend/CoParent.Api/CoParent.Api.csproj -c Release --no-restore -o /app

# 3. Runtime. Chiseled: no shell or package manager, runs as a non-root user by default.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /app ./
COPY --from=spa /spa/dist/parenthesis/browser ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "CoParent.Api.dll"]
