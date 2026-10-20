# Runbook: Azure environments and GitHub settings

Sets up the **development** and **production** environments that `.github/workflows/deploy.yml` deploys to, and the
GitHub settings the workflow needs. The rules are in [the development workflow](../development-workflow.md). Until
step 6 is done, the deploy workflow does nothing.

Status (October 20, 2026): **development is set up and deployed** (steps 1–3, 3a for development, 4 and 6; `SUFFIX=15465`; first deployment October 20). Email: Brevo (see "Email (Brevo)"). Production (steps 2–3 with `ENV=prod`, its GitHub variables, and the production readers' role assignments) is still to do before the first production release window (October 30, 2026).

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

**Paste one line at a time.** In Azure Cloud Shell, multi-line pastes broke (October 19, 2026), so every command
below is a single line. Cloud Shell also times out after a while and **wipes your variables**: write down `SUFFIX`
the moment you pick it, and if the shell restarts, set the variables again (the first block) before carrying on.

Development (October 19, 2026): `ENV=dev`, `LOC=centralus`, `SUFFIX=15465`.

```bash
az login
ENV=dev
LOC=centralus
SUFFIX=$RANDOM && echo "Write this down: SUFFIX=$SUFFIX"
RG=rg-parenthesis-$ENV
PG=psql-parenthesis-$ENV-$SUFFIX
KV=kv-parenthesis-$ENV-$SUFFIX
```

After a Cloud Shell restart, set the same variables with the recorded suffix instead of `$RANDOM`
(for development: `ENV=dev; LOC=centralus; SUFFIX=15465; RG=rg-parenthesis-dev; PG=psql-parenthesis-dev-15465; KV=kv-parenthesis-dev-15465`).

### Register the resource providers (new subscriptions only)
A new subscription hasn't registered these services yet, and creating them fails until it has. Once per
subscription; each takes a minute or two:

```bash
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.KeyVault --wait
az provider register --namespace Microsoft.Storage --wait
```

If a later command says another namespace "is not registered", register it the same way.

### Resources

```bash
az group create -n $RG -l $LOC
az monitor log-analytics workspace create -g $RG -n log-parenthesis-$ENV -l $LOC
az monitor app-insights component create -g $RG -a appi-parenthesis-$ENV -l $LOC --workspace log-parenthesis-$ENV
az containerapp env create -g $RG -n cae-parenthesis-$ENV -l $LOC --logs-workspace-id "$(az monitor log-analytics workspace show -g $RG -n log-parenthesis-$ENV --query customerId -o tsv)" --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys -g $RG -n log-parenthesis-$ENV --query primarySharedKey -o tsv)"
az postgres flexible-server create -g $RG -n $PG -l $LOC --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 --admin-user parenthesisadmin --public-access 0.0.0.0 --backup-retention 7
az postgres flexible-server db create -g $RG --server-name $PG --name coparent
az keyvault create -g $RG -n $KV -l $LOC --enable-rbac-authorization true
az storage account create -g $RG -n stparenthesis$ENV$SUFFIX -l $LOC --sku Standard_LRS --allow-blob-public-access false --min-tls-version TLS1_2
```

- The container app environment uses the consumption plan, which scales to zero.
- PostgreSQL 17 on the smallest tier keeps 7 days of point-in-time backups. You'll be asked for an admin password:
  keep it only in Key Vault (below), never in chat or files.
- `--public-access 0.0.0.0` lets only Azure services (including Container Apps) reach the database. It does not open
  it to the internet.
- `db create` takes `--server-name` and `--name` in the current CLI (the old `-s`/`-d` form failed).
- The storage account is for uploads when Milestone 5 needs it.

### The app and its migration job
The first deployment uses a placeholder image; the workflow replaces it.

```bash
az containerapp create -g $RG -n ca-parenthesis-$ENV --environment cae-parenthesis-$ENV --image mcr.microsoft.com/k8se/quickstart:latest --target-port 8080 --ingress external --min-replicas 0 --max-replicas 2 --system-assigned
az containerapp job create -g $RG -n job-parenthesis-migrate-$ENV --environment cae-parenthesis-$ENV --image mcr.microsoft.com/k8se/quickstart:latest --trigger-type Manual --replica-timeout 600 --replica-retry-limit 0 --args migrate --system-assigned
```

The migration job runs the API image with the `migrate` argument (`dotnet CoParent.Api.dll migrate`), which applies
every module's migrations and exits.

### Key Vault secrets
The vault uses Azure RBAC, so even the subscription Owner can't write secrets until it has a data role on the vault.
Grant yourself **Key Vault Secrets Officer** first (it can take a minute to apply), then set the secrets:

```bash
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n $KV --query id -o tsv)"
az keyvault secret set --vault-name $KV -n postgres --value "Host=$PG.postgres.database.azure.com;Database=coparent;Username=parenthesisadmin;Password=<the admin password>;Ssl Mode=Require"
az keyvault secret set --vault-name $KV -n appinsights --value "$(az monitor app-insights component show -g $RG -a appi-parenthesis-$ENV --query connectionString -o tsv)"
```

Type the admin password into the `postgres` command yourself; don't save it anywhere else. Cloud Shell keeps command
history, so clear it afterwards (`history -c`).

### Wire the secrets into the app and the job
Each has its own identity. Give both read access to the vault, then add the `postgres` secret as a Key Vault
reference (`keyvaultref`), so the value never sits in the container app's configuration:

```bash
KV_ID="$(az keyvault show -n $KV --query id -o tsv)"
PG_SECRET="https://$KV.vault.azure.net/secrets/postgres"
az role assignment create --assignee "$(az containerapp show -g $RG -n ca-parenthesis-$ENV --query identity.principalId -o tsv)" --role "Key Vault Secrets User" --scope "$KV_ID"
az role assignment create --assignee "$(az containerapp job show -g $RG -n job-parenthesis-migrate-$ENV --query identity.principalId -o tsv)" --role "Key Vault Secrets User" --scope "$KV_ID"
az containerapp secret set -g $RG -n ca-parenthesis-$ENV --secrets "postgres=keyvaultref:$PG_SECRET,identityref:system"
az containerapp job secret set -g $RG -n job-parenthesis-migrate-$ENV --secrets "postgres=keyvaultref:$PG_SECRET,identityref:system"
```

- **Reference the secret without a version** (as above, not the `id` that `az keyvault secret show` prints, which
  ends in a version), so a new password or key is picked up without re-wiring.
- **Check the roles stuck** before going on. Each identity should show `Key Vault Secrets User`:
  `az role assignment list --scope "$KV_ID" --query "[].{who:principalId,role:roleDefinitionName}" -o table`.
  If a role command failed with an "internal server error", Azure couldn't look up the identity: run the lookup on
  its own line, check it printed an ID, then assign with `--assignee-object-id <id> --assignee-principal-type
  ServicePrincipal`.
- **If the secret was wired before the role worked**, the app or job keeps the failed lookup. After the role is in
  place (allow up to 10 minutes), run the two `secret set` lines again to make them fetch it fresh. This is what
  fixed the first development deployment (October 20, 2026).

### Environment variables

```bash
URL="https://$(az containerapp show -g $RG -n ca-parenthesis-$ENV --query properties.configuration.ingress.fqdn -o tsv)" && echo "APP_URL for GitHub: $URL"
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars ConnectionStrings__Postgres=secretref:postgres App__PublicBaseUrl=$URL ASPNETCORE_ENVIRONMENT=Production ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
az containerapp job update -g $RG -n job-parenthesis-migrate-$ENV --set-env-vars ConnectionStrings__Postgres=secretref:postgres
```

`ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` is required. Container Apps ends HTTPS at its ingress and forwards plain
HTTP with `X-Forwarded-Proto`/`X-Forwarded-For`; without it the app treats every request as insecure, and creating an
account fails with "Something went wrong" because the antiforgery cookie requires HTTPS (the development site,
October 20, 2026). It also gives the rate limiter the visitor's real address. Only Azure's ingress can reach the app,
so trusting these headers is safe.

Development's `APP_URL` is `https://dev.parenthesisfamily.com` (custom domain, see below); the built-in address
`https://ca-parenthesis-dev.calmfield-0e9f47dd.centralus.azurecontainerapps.io` still works.

### Custom domain
Development uses `dev.parenthesisfamily.com` with Azure's free managed certificate (October 20, 2026):

```bash
az containerapp show -n ca-parenthesis-$ENV -g $RG --query "{fqdn:properties.configuration.ingress.fqdn, verificationId:properties.customDomainVerificationId}" -o table
az containerapp hostname add -n ca-parenthesis-$ENV -g $RG --hostname <host>
az containerapp hostname bind -n ca-parenthesis-$ENV -g $RG --hostname <host> --environment cae-parenthesis-$ENV --validation-method CNAME
az containerapp update -n ca-parenthesis-$ENV -g $RG --set-env-vars App__PublicBaseUrl=https://<host>
```

Before `hostname add`, create two DNS records for `parenthesisfamily.com`: a CNAME from the host's name (for example
`dev`) to the `fqdn`, and a TXT record `asuid.<name>` with the `verificationId`. After `bind`, set the GitHub
environment's `APP_URL` to the new address so the deploy's smoke tests use it.

**Development only: invite-only sign-up.** Only the testers you list can create an account there. Separate the
addresses with commas; an invited co-parent must be on the list too. Production leaves these unset, so anyone can sign
up.

```bash
az containerapp update -g rg-parenthesis-dev -n ca-parenthesis-dev --set-env-vars Identity__SignUp__InviteOnly=true "Identity__SignUp__AllowedEmails=tester1@example.com,tester2@example.com"
```

To add or remove a tester later, run the same command with the full new list. Anyone else who tries to register sees
"Sign-up here is by invitation only." Existing accounts can still sign in.

### Email (Brevo)
Email goes out through Brevo's SMTP relay (owner decision, October 20, 2026). `parenthesisfamily.com` is
authenticated in Brevo, and mail comes from `no-reply@parenthesisfamily.com`. The app's settings are `Email__Smtp__*`
and `Email__From*`; the SMTP key lives only in Key Vault.

1. In Brevo, **SMTP & API → SMTP**: note the **SMTP login** (not your account email) and generate an SMTP key.
2. Store the key in Key Vault without it appearing on screen (development uses the secret name `brevo-smtp`):

```bash
az keyvault secret set --vault-name $KV -n brevo-smtp --value "$(read -rsp 'Brevo SMTP key: ' k; echo >&2; echo "$k")" --query name -o tsv
az containerapp secret set -g $RG -n ca-parenthesis-$ENV --secrets "brevo-smtp=keyvaultref:https://$KV.vault.azure.net/secrets/brevo-smtp,identityref:system"
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars Email__Smtp__Host=smtp-relay.brevo.com Email__Smtp__Port=587 Email__Smtp__UseStartTls=true "Email__Smtp__Username=<Brevo SMTP login>" Email__Smtp__Password=secretref:brevo-smtp Email__FromAddress=no-reply@parenthesisfamily.com Email__FromName=Parenthesis
```

Only the app sends email; the migration job doesn't need these. Then sign up with a tester address: the confirmation
email should arrive within a minute. If it doesn't, the app logs "Failed to send account email" with the subject only
(never the address).

The development key expires in October 2027; rotate it in Brevo and store the new one with the same first command
(the reference has no version, so the app picks it up after a restart).

Still to do before families use it (TODO.md): a custom domain with HTTPS, and the data-protection key ring (S-01).

**Development holds synthetic data only.** Never copy production data into it.

### Application Insights (prepared now, wired up later)
`appi-parenthesis-$ENV` (created above) sits on the environment's Log Analytics workspace, and its connection string
is already in Key Vault as `appinsights`. The app doesn't send telemetry yet; that's planned work. Cap log ingestion
so telemetry can't run up the bill (GB per day; 0.5 is plenty for one environment):

```bash
az monitor log-analytics workspace update -g $RG -n log-parenthesis-$ENV --quota 0.5
```

When the app is wired up, it reads `APPLICATIONINSIGHTS_CONNECTION_STRING` from a `secretref:appinsights` app setting.
Telemetry must not carry personal data: no names, emails, children's details, diary or message text, and no request
bodies. Production telemetry is real family activity, so only the production readers below see it.

## 3. Sign-in for GitHub Actions (OpenID Connect, no passwords)
One identity per environment, each allowed to change only its own resource group.

GitHub identifies this repository by owner and repository IDs, so the federated credential's subject must be
`repo:esaldivar@16743046/parenthesis@1422639942:environment:<environment>`, not the plain
`repo:esaldivar/parenthesis:...` form. With the plain form, sign-in fails with `AADSTS700213: No matching federated
identity record` (the first development deployment, October 19, 2026). That error message quotes the exact subject
GitHub sent.

```bash
APP_ID="$(az ad app create --display-name github-parenthesis-$ENV --query appId -o tsv)"
az ad sp create --id $APP_ID
GH_ENV=development            # GitHub environment name: "development" for dev, "production" for prod
az ad app federated-credential create --id $APP_ID --parameters "{\"name\": \"github-$GH_ENV-ids\", \"issuer\": \"https://token.actions.githubusercontent.com\", \"subject\": \"repo:esaldivar@16743046/parenthesis@1422639942:environment:$GH_ENV\", \"audiences\": [\"api://AzureADTokenExchange\"]}"
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
az role assignment create --assignee-object-id "$(group_id parenthesis-dev-contributors)" --assignee-principal-type Group --role Contributor --scope "$(az group show -n rg-parenthesis-dev --query id -o tsv)"
az role assignment create --assignee-object-id "$(group_id parenthesis-dev-contributors)" --assignee-principal-type Group --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n $DEV_KV --query id -o tsv)"

# After ENV=prod
for role in Reader "Monitoring Reader" "Log Analytics Reader"; do az role assignment create --assignee-object-id "$(group_id parenthesis-prod-readers)" --assignee-principal-type Group --role "$role" --scope "$(az group show -n rg-parenthesis-prod --query id -o tsv)"; done

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

## Troubleshooting a deployment
The Deploy run in Actions shows which step failed. A failed migration or deployment rolls back on its own; the
reason is in Azure's logs. Run these in Cloud Shell (one line each):

```bash
az containerapp job execution list -n job-parenthesis-migrate-$ENV -g $RG --query "[].{name:name,status:properties.status,start:properties.startTime}" -o table
az monitor log-analytics query -w "$(az monitor log-analytics workspace show -g $RG -n log-parenthesis-$ENV --query customerId -o tsv)" --analytics-query "union ContainerAppConsoleLogs_CL, ContainerAppSystemLogs_CL | where TimeGenerated > ago(1h) | where * has 'parenthesis' | order by TimeGenerated desc | take 40 | project TimeGenerated, Reason=column_ifexists('Reason_s',''), Log=coalesce(column_ifexists('Log_s',''), column_ifexists('Log',''))" -o table
EXEC=$(az containerapp job start -n job-parenthesis-migrate-$ENV -g $RG --query name -o tsv); sleep 60; az containerapp job execution show -n job-parenthesis-migrate-$ENV -g $RG --job-execution-name "$EXEC" --query properties.status -o tsv
```

- Logs reach Log Analytics a few minutes late, and column names vary, so the query above searches every column.
- `FetchingSecretFromAzureKeyVaultFailed` / `403`: the identity lacks Key Vault Secrets User, or the secret was wired
  before the role worked (see "Wire the secrets into the app and the job").
- Check the database login with the stored connection string, without printing it:
  `PGPASSWORD="$(az keyvault secret show --vault-name $KV -n postgres --query value -o tsv | sed -E 's/.*Password=([^;]*).*/\1/I')" psql "host=$PG.postgres.database.azure.com dbname=coparent user=parenthesisadmin sslmode=require" -c "select 1"`.
- Firewall: `az postgres flexible-server firewall-rule list -g $RG --server-name $PG -o table` should show a
  `0.0.0.0` rule (Azure services). The current CLI takes `--server-name`, not `--name`.
- Live logs (`az containerapp job logs show`) only attach while a container is running; a failing migration exits
  too fast, so use the log query instead.

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
