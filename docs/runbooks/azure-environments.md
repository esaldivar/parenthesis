# Runbook: Azure environments and GitHub settings

Sets up the **development** and **production** environments that `.github/workflows/deploy.yml` deploys to, and the
GitHub settings the workflow needs. The rules are in [the development workflow](../development-workflow.md). Until
step 6 is done, the deploy workflow does nothing.

Status (October 18, 2026): **not started.** The owner has no Azure subscription yet.

Everything below is done by the owner, once. Commands use the [Azure CLI](https://learn.microsoft.com/cli/azure/)
(`az`), which also runs in the browser through Azure Cloud Shell. Never paste secrets, passwords or connection
strings into chat, issues or commits.

## 1. Azure account and cost guardrails
1. Create an Azure account at <https://azure.microsoft.com/free> with the owner's own Microsoft account. New accounts
   get trial credit for 30 days and 12 months of some services free, including a small PostgreSQL Flexible Server
   (check the current offer on that page).
2. Upgrade to **pay-as-you-go** when the trial ends, or the environments stop.
3. In **Cost Management → Budgets**, create a monthly budget (for example $25) with email alerts at 50%, 80% and
   100%.

Rough monthly cost at the smallest tiers, per environment: Container Apps consumption (scales to zero; often within
the free monthly grant), PostgreSQL Flexible Server Burstable B1ms (the main cost, roughly $13–15 without the free
offer), Storage and Key Vault (cents). Check the [pricing calculator](https://azure.microsoft.com/pricing/calculator/)
before creating anything.

## 2. Create each environment
Run this once with `ENV=dev` and once with `ENV=prod`. Pick a region close to the families (the example uses
`centralus`). Names that must be globally unique get a short random suffix.

```bash
az login
ENV=dev                      # then repeat with ENV=prod
LOC=centralus
SUFFIX=$RANDOM
RG=rg-parenthesis-$ENV
az group create -n $RG -l $LOC

# Logs and monitoring
az monitor log-analytics workspace create -g $RG -n log-parenthesis-$ENV -l $LOC
az monitor app-insights component create -g $RG -a appi-parenthesis-$ENV -l $LOC \
  --workspace log-parenthesis-$ENV

# Container Apps environment (consumption plan, scales to zero)
az containerapp env create -g $RG -n cae-parenthesis-$ENV -l $LOC \
  --logs-workspace-id "$(az monitor log-analytics workspace show -g $RG -n log-parenthesis-$ENV --query customerId -o tsv)" \
  --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys -g $RG -n log-parenthesis-$ENV --query primarySharedKey -o tsv)"

# PostgreSQL 17, smallest tier, 7-day point-in-time backups. You'll be asked for an admin password: store it only in
# Key Vault (below).
az postgres flexible-server create -g $RG -n psql-parenthesis-$ENV-$SUFFIX -l $LOC \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 \
  --admin-user parenthesisadmin --public-access 0.0.0.0 --backup-retention 7
az postgres flexible-server db create -g $RG -s psql-parenthesis-$ENV-$SUFFIX -d coparent

# Secrets
az keyvault create -g $RG -n kv-parenthesis-$ENV-$SUFFIX -l $LOC --enable-rbac-authorization true

# Blob storage (for uploads, when Milestone 5 needs it)
az storage account create -g $RG -n stparenthesis$ENV$SUFFIX -l $LOC --sku Standard_LRS \
  --allow-blob-public-access false --min-tls-version TLS1_2
```

`--public-access 0.0.0.0` allows only Azure services (including Container Apps) to reach the database. It does not
open it to the internet.

### The app and its migration job
The first deployment uses a placeholder image; the workflow replaces it.

```bash
az containerapp create -g $RG -n ca-parenthesis-$ENV --environment cae-parenthesis-$ENV \
  --image mcr.microsoft.com/k8se/quickstart:latest --target-port 8080 --ingress external \
  --min-replicas 0 --max-replicas 2 --system-assigned
az containerapp job create -g $RG -n job-parenthesis-migrate-$ENV --environment cae-parenthesis-$ENV \
  --image mcr.microsoft.com/k8se/quickstart:latest --trigger-type Manual \
  --replica-timeout 600 --replica-retry-limit 0 --args migrate --system-assigned
```

The migration job runs the API image with the `migrate` argument (`dotnet CoParent.Api.dll migrate`), which applies
every module's migrations and exits.

### App settings
Store the connection string in Key Vault, give both identities read access, and point the app and the job at it.

```bash
KV=kv-parenthesis-$ENV-$SUFFIX
PG=psql-parenthesis-$ENV-$SUFFIX
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n $KV --query id -o tsv)"
az keyvault secret set --vault-name $KV -n postgres \
  --value "Host=$PG.postgres.database.azure.com;Database=coparent;Username=parenthesisadmin;Password=<the admin password>;Ssl Mode=Require"

for target in "containerapp ca-parenthesis-$ENV" "containerapp job job-parenthesis-migrate-$ENV"; do
  principal="$(az $target show -g $RG --query identity.principalId -o tsv)"
  az role assignment create --assignee "$principal" --role "Key Vault Secrets User" \
    --scope "$(az keyvault show -n $KV --query id -o tsv)"
  az $target secret set -g $RG \
    --secrets "postgres=keyvaultref:$(az keyvault secret show --vault-name $KV -n postgres --query id -o tsv),identityref:system"
done

URL="https://$(az containerapp show -g $RG -n ca-parenthesis-$ENV --query properties.configuration.ingress.fqdn -o tsv)"
az containerapp update -g $RG -n ca-parenthesis-$ENV \
  --set-env-vars ConnectionStrings__Postgres=secretref:postgres App__PublicBaseUrl=$URL ASPNETCORE_ENVIRONMENT=Production
az containerapp job update -g $RG -n job-parenthesis-migrate-$ENV \
  --set-env-vars ConnectionStrings__Postgres=secretref:postgres
echo "APP_URL for GitHub: $URL"
```

Still to do before families use it (TODO.md): real email sending (`Email__Smtp__*`, for example Azure Communication
Services), the invite-only tester allow-list on development, a custom domain with HTTPS, and the data-protection key
ring (S-01).

**Development holds synthetic data only.** Never copy production data into it.

## 3. Sign-in for GitHub Actions (OpenID Connect, no passwords)
One identity per environment, each allowed to change only its own resource group.

```bash
APP_ID="$(az ad app create --display-name github-parenthesis-$ENV --query appId -o tsv)"
az ad sp create --id $APP_ID
GH_ENV=development            # GitHub environment name: "development" for dev, "production" for prod
az ad app federated-credential create --id $APP_ID --parameters "{
  \"name\": \"github-$GH_ENV\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:esaldivar/parenthesis:environment:$GH_ENV\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
az role assignment create --assignee $APP_ID --role Contributor --scope "$(az group show -n $RG --query id -o tsv)"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)"
```

## GitHub settings
### 4. Environments
**Settings → Environments → New environment**, twice:

| | `development` | `production` |
|---|---|---|
| Deployment branches and tags | Selected branches: `develop` | Selected branches: `main` |
| Required reviewers | none | **the owner**. Leave "Prevent self-review" unticked, so the owner can approve their own merge |
| Environment variables | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (from step 3), `AZURE_RESOURCE_GROUP` (`rg-parenthesis-dev`), `AZURE_CONTAINER_APP` (`ca-parenthesis-dev`), `AZURE_MIGRATION_JOB` (`job-parenthesis-migrate-dev`), `APP_URL` (from step 2) | The same names with the `prod` values |

These identifiers aren't secrets (sign-in works only from this repository's workflow in that environment), so they
are variables.

### 5. Branch rules
1. **Settings → Rules → Rulesets → New branch ruleset**, named `release branches`:
   - Enforcement: **Active**. Bypass list: empty.
   - Target branches: **Include by pattern** `release/*`.
   - Rules: **Restrict deletions**; **Require a pull request before merging** (0 approvals); **Require status
     checks to pass**, with "Require branches to be up to date" on, and these checks: `Backend (build, format,
     tests)`, `Frontend (lint, test, build)`, `API image`, `PR source (main accepts develop or hotfix/*)`;
     **Block force pushes**.
2. **Settings → Branches → `develop`** (existing rule): add `PR source (main accepts develop or hotfix/*)` to the
   required checks if it isn't there. Keep the rest.
3. `main` stays as it is.
4. **Settings → General → Pull Requests:** keep "Allow merge commits" **on** (releases need them) and "Allow
   auto-merge" **off**.

(The PR source check keeps its old name because branch protection refers to it by name. It checks every target.)

### 6. Turn deployments on
1. **Settings → Secrets and variables → Actions → Variables → New repository variable:** `DEPLOY_ENABLED` = `true`.
2. After the first deployment, open the `parenthesis-api` package on the repository's **Packages** page →
   **Package settings** → set visibility to **Public** (the repository is public and the image holds no secrets), so
   Container Apps can pull it without a registry password. Or keep it private and add a registry credential to both
   container apps.
3. Confirm the `DISCORD_WEBHOOK_URL` secret exists (Settings → Secrets → Actions); deployments and release windows
   report there.

## Rollback
- **Automatic:** a failed deployment or smoke test restores the previous image.
- **To a released version:** Actions → **Deploy** → Run workflow. Pick the branch `main` for production or `develop`
  for development (each environment only accepts its own branch), then the environment and version (for example
  `v0.2.0`). Production still asks for approval.
- **Instant, from Azure:** Container Apps keeps earlier revisions. Portal → the container app → **Revisions** →
  activate the previous one and send it 100% of traffic.
- **Database:** migrations aren't reversed. If a migration damaged data, restore the server to a point before the
  deployment (it creates a new server), then point the `postgres` secret at it:
  `az postgres flexible-server restore -g $RG -n <new-name> --source-server $PG --restore-time "<UTC time>"`.
