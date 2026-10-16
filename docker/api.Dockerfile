# API image. Build from the repo root:
#   docker build -f docker/api.Dockerfile -t parenthesis-api .
# The Angular build stage is added when the frontend lands (Milestone 1, PR 11).

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

# Chiseled runtime: no shell or package manager, runs as a non-root user by default.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "CoParent.Api.dll"]
