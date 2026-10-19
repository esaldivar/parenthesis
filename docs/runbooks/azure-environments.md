# Runbook: Azure environments and GitHub settings

Sets up the **development** and **production** environments that `.github/workflows/deploy.yml` deploys to, and the
GitHub settings the workflow needs. The rules are in [the development workflow](../development-workflow.md). Until
step 6 is done, the deploy workflow does nothing.

Status (October 19, 2026): GitHub settings (steps 4 and 5) **done**, except the environment variables. Azure (steps 1–3, 3a, 6) **not started**; the owner starts with the development environment.

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

**Development only: invite-only sign-up.** Only the testers you list can create an account there. Separate the
addresses with commas; an invited co-parent must be on the list too. Production leaves these unset, so anyone can sign
up.

```bash
az containerapp update -g rg-parenthesis-dev -n ca-parenthesis-dev \
  --set-env-vars Identity__SignUp__InviteOnly=true "Identity__SignUp__AllowedEmails=tester1@example.com,tester2@example.com"
```

To add or remove a tester later, run the same command with the full new list. Anyone else who tries to register sees
"Sign-up here is by invitation only." Existing accounts can still sign in.

Still to do before families use it (TODO.md): real email sending (`Email__Smtp__*`, for example Azure Communication
Services), a custom domain with HTTPS, and the data-protection key ring (S-01).

**Development holds synthetic data only.** Never copy production data into it.

### Application Insights (prepared now, wired up later)
Step 2 already creates `appi-parenthesis-$ENV` on the environment's Log Analytics workspace. The app doesn't send
telemetry yet; that's planned work. Prepare it now so it's ready:

```bash
# Cap log ingestion so telemetry can't run up the bill (GB per day; 0.5 is plenty for one environment).
az monitor log-analytics workspace update -g $RG -n log-parenthesis-$ENV --quota 0.5

# Keep the connection string in Key Vault, like the database's, for when the app starts using it.
az keyvault secret set --vault-name $KV -n appinsights \
  --value "$(az monitor app-insights component show -g $RG -a appi-parenthesis-$ENV --query connectionString -o tsv)"
```

When the app is wired up, it reads `APPLICATIONINSIGHTS_CONNECTION_STRING` from a `secretref:appinsights` app setting.
Telemetry must not carry personal data: no names, emails, children's details, diary or message text, and no request
bodies. Production telemetry is real family activity, so only the production readers below see it.

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

### 3a. People and roles (who may change what)
The deploy identities above are for GitHub Actions only. People get access through Entra ID groups, so adding a
collaborator later is one step. Two working roles plus an emergency admin; there's no separate "non-production" role
because there are only two environments (add one if a staging environment ever exists).

| Role (Entra group) | Access | Who |
|---|---|---|
| **Developer** (`parenthesis-dev-contributors`) | Contributor on `rg-parenthesis-dev`; Key Vault Secrets Officer on the dev Key Vault. Nothing in production. | The owner day to day; future collaborators |
| **Production reader** (`parenthesis-prod-readers`) | Reader, Monitoring Reader and Log Analytics Reader on `rg-parenthesis-prod`: health, revisions, logs and Application Insights. No changes, no secrets. | The owner day to day |
| **Production admin** (no group) | Owner on the subscription. Emergencies only, never daily work. | The owner only |

Production changes go only through the deploy workflow, which waits for the owner's approval; nobody needs day-to-day
write access to production or its database. Don't work daily as the Owner: use an everyday account in the two groups
and keep the Owner account for emergencies. (Just-in-time admin with Privileged Identity Management needs an Entra ID
P2 licence; the separate admin account gives most of the benefit for free.)

Run once (groups), then the matching part after each environment exists:

```bash
az ad group create --display-name parenthesis-dev-contributors --mail-nickname parenthesis-dev-contributors
az ad group create --display-name parenthesis-prod-readers --mail-nickname parenthesis-prod-readers
group_id() { az ad group show -g "$1" --query id -o tsv; }

# After ENV=dev
DEV_KV=kv-parenthesis-dev-<suffix>
az role assignment create --assignee-object-id "$(group_id parenthesis-dev-contributors)" --assignee-principal-type Group \
  --role Contributor --scope "$(az group show -n rg-parenthesis-dev --query id -o tsv)"
az role assignment create --assignee-object-id "$(group_id parenthesis-dev-contributors)" --assignee-principal-type Group \
  --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n $DEV_KV --query id -o tsv)"

# After ENV=prod
for role in Reader "Monitoring Reader" "Log Analytics Reader"; do
  az role assignment create --assignee-object-id "$(group_id parenthesis-prod-readers)" --assignee-principal-type Group \
    --role "$role" --scope "$(az group show -n rg-parenthesis-prod --query id -o tsv)"
done

# Add a person (the owner's everyday account, or a collaborator)
az ad group member add -g parenthesis-dev-contributors --member-id "<user object id>"
```

These are Azure roles for managing the infrastructure. They're unrelated to the parent and child roles inside the app.

## GitHub settings
### 4. Environments
**Settings → Environments → New environment**, twice:

| | `development` | `production` |
|---|---|---|
| Deployment branches and tags | Selected branches: `develop` | Selected branches: `main` |
| Required reviewers | none | **the owner**. Leave "Prevent self-review" unticked, so the owner can approve their own merge |
| Allow administrators to bypass | (any) | **Unticked**, so every production deployment waits for approval |
| Environment variables | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (from step 3), `AZURE_RESOURCE_GROUP` (`rg-parenthesis-dev`), `AZURE_CONTAINER_APP` (`ca-parenthesis-dev`), `AZURE_MIGRATION_JOB` (`job-parenthesis-migrate-dev`), `APP_URL` (from step 2) | The same names with the `prod` values |

These identifiers aren't secrets (sign-in works only from this repository's workflow in that environment), so they
are variables.

### 5. Branch rules
1. **Settings → Rules → Rulesets → New branch ruleset**, named `release branches`:
   - Enforcement: **Active**. Bypass list: empty.
   - Target branches: **Include by pattern** `release/*`.
   - Rules: **Restrict deletions**; **Require a pull request before merging** (0 approvals); **Require status
     checks to pass**, with "Require branches to be up to date" and "Do not require status checks on creation" on
     (so new release branches can be created), and these checks: `Backend (build, format,
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
