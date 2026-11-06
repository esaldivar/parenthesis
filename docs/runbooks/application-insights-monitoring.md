# Application Insights monitoring and alerts (#86)

How the API sends telemetry to Application Insights, which alerts exist, what they cost, and how to turn on and
verify each piece. Nothing here is live until the owner approves it and runs the steps below; this change does not
deploy or alter Azure resources.

## Why Server requests showed no data

Development's `appi-parenthesis-dev` existed and `/health/ready` returned 200, but nothing ever sent it requests:

1. **No exporter in the API.** The backend had no Application Insights, Azure Monitor or OpenTelemetry exporter, so
   requests were only written to the container's console logs (confirmed in the
   [October 25 verification](application-insights-verification-2026-10-25.md), and still true on `release/0.3.0`).
2. **No connection string in the container app.** The [Azure runbook](azure-environments.md) stored the connection
   string in Key Vault (`appinsights`) but never gave the app an `APPLICATIONINSIGHTS_CONNECTION_STRING` setting.
3. **No alert rules.** Resources were created by hand from the runbook; there was no infrastructure-as-code, so no
   availability tests or alert rules existed. The *Application Insights Smart Detection* action group is created
   automatically with the resource and has no rules behind it.

Not re-checked live for this change (no Azure access from the work machine): the container app's current settings.

## What the change adds

- **API telemetry** ([TelemetryExtensions.cs](../../src/backend/CoParent.Api/Hosting/TelemetryExtensions.cs)): the
  Azure Monitor OpenTelemetry distro, **only** when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set. Local runs and
  tests send nothing.
- **Monitoring as code** ([infra/monitoring/main.bicep](../../infra/monitoring/main.bicep)): one action group, two
  availability tests and three alert rules per environment. CI builds and lints it (**Infrastructure** job); it is
  never deployed by a workflow.

### What telemetry contains

| Sent | Not sent |
|---|---|
| Request method, path, status code, duration, W3C trace id (the same `trace-id` users see) | Query strings (removed from requests and outgoing HTTP calls) |
| PostgreSQL dependency: duration, success, parameterized SQL text | Parameter values, request or response bodies, headers, cookies |
| Outgoing HTTP calls (Google APIs, Blob storage): host, path, status, duration | Information-level logs (one per request; they stay in the container logs) |
| Warning and error logs, exceptions with stack traces | Live Metrics (turned off) |

Paths contain record ids (GUIDs), never names. Application Insights stores client IPs as `0.0.0.0` by default.
Exception messages are the main risk: code must not put personal data in exception messages or warning logs, the
same rule that already applies to the container logs.

## Alerts

All alerts email the address passed as `alertEmail` at deployment, through the action group
`ag-parenthesis-<env>`. Azure Monitor cannot post to Discord without a paid Logic App or a relay, so Discord
#site-status keeps its free [UptimeRobot alerts](uptime-monitoring.md).

| Alert | Signal | Fires when | Severity |
|---|---|---|---|
| `alert-parenthesis-<env>-frontend-unavailable` | Standard availability test `GET <appUrl>/` | Every test location fails (not 200, no `<app-root`, TLS error, certificate expiring within 7 days, or no answer within 120 s after one retry) in a 15-minute window | 1 |
| `alert-parenthesis-<env>-ready-unavailable` | Standard availability test `GET <appUrl>/health/ready` | Same rule; `/health/ready` returns 503 when PostgreSQL is unreachable, so this is the database alert | 1 |
| `alert-parenthesis-<env>-api-error-rate` | Log query on `requests` every 15 minutes | In 15 minutes, at least **20** requests (health checks excluded) and at least **5%** of them returned **5xx** | 2 |

Why these numbers:

- **One location, every 15 minutes, all locations must fail.** The cheapest setting that still catches an outage.
  Cold starts after scale-to-zero are covered by the 120-second timeout and a retry. An outage can take up to about
  30 minutes to alert. More locations (parameter `testLocations`) alert faster and more reliably but cost more.
- **5xx only.** Signed-out 401s and validation 400s are normal traffic.
- **At least 20 requests.** One failing request from one person is not a spike. The trade-off: at very low traffic
  the error-rate alert stays quiet, and the availability alerts are what catch a full outage.

All rules resolve themselves (`autoMitigate`) when the condition clears, which sends a "Resolved" email.

## Cost (owner decision needed)

The [uptime runbook](uptime-monitoring.md) has a **$0/month** rule for monitoring, decided October 28, 2026, and
names Azure availability tests and alert rules as excluded. Deploying this Bicep **breaks that rule**, so it needs
the owner's explicit decision to change it first.

Rough monthly cost per environment with the defaults, from third-party copies of Azure prices on November 5, 2026
(not confirmed on Microsoft's own price page; check the
[Azure Monitor pricing page](https://azure.microsoft.com/pricing/details/monitor/) before deciding):

| Item | Estimate |
|---|---|
| 2 standard tests × 1 location × 96 runs a day (≈ 5,800 runs) at about $0.0005 each | ≈ $3 |
| 2 metric alert rules | ≈ $0–0.20 (small free allowance) |
| 1 log alert rule, every 15 minutes | ≈ $0.50 |
| Telemetry ingestion | Within the existing 0.5 GB/day workspace cap |
| **Keeping the app awake:** each test run wakes the scale-to-zero container for about 5 minutes, 8 times an hour | Extra Container Apps compute; not estimated |

The telemetry alone (step 1) has no new fixed cost beyond ingestion under the existing cap.

## Turning it on (owner, per environment)

Each step changes live Azure resources: run it only after approving it. Set `ENV`, `RG` and `KV` as in the
[Azure runbook](azure-environments.md).

### 1. Send telemetry (after this change is deployed to the environment)

```bash
az containerapp secret set -g $RG -n ca-parenthesis-$ENV --secrets "appinsights=keyvaultref:https://$KV.vault.azure.net/secrets/appinsights,identityref:system"
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights
```

### 2. Alerts and availability tests

Preview first, then deploy. `alertEmail` is typed at the command line, never committed.

```bash
az deployment group what-if -g $RG -f infra/monitoring/main.bicep -p env=$ENV appUrl=https://dev.parenthesisfamily.com alertEmail=<owner email>
az deployment group create -g $RG -f infra/monitoring/main.bicep -p env=$ENV appUrl=https://dev.parenthesisfamily.com alertEmail=<owner email>
```

Azure emails the address to say it was added to the action group.

## Verifying each piece

| Check | How | Passes when |
|---|---|---|
| Telemetry arrives | `curl -si <appUrl>/health/ready`, note the `trace-id` header, wait 5 minutes, then in Application Insights **Logs** run `requests \| where operation_Id == "<trace-id>"` | One row, status 200; `dependencies \| where operation_Id == "<trace-id>"` shows the PostgreSQL call |
| Query strings dropped | Request `<appUrl>/health/live?probe=synthetic` and look it up the same way | `url` has no `?probe=` |
| Email delivery | Action group → **Test action group** → *Resource health alert* | Test email arrives |
| Frontend alert | In the portal, edit the *Frontend* test: expected status `418`. Wait up to 30 minutes, then set it back to `200` | Alert email, then "Resolved" email |
| Database alert | Same with the *Database readiness* test. The 503 behavior itself is covered by `HealthEndpointTests` | Alert email, then "Resolved" email |
| Error-rate alert | Temporarily edit the rule's query: `total >= 1 and failurePercent >= 0`. Browse the site, wait up to 30 minutes, then restore the query | Alert email, then "Resolved" after restoring |

Editing a test or rule this way is a live change on the environment: do it in development, and restore it the same
day. Never stop PostgreSQL or the app to test an alert.

## When an alert fires

1. **Frontend or database readiness.** Open `<appUrl>/health/live` and `/health/ready`. Then follow the
   [uptime runbook's response steps](uptime-monitoring.md): revisions, container logs, PostgreSQL state.
2. **Error rate.** In Logs: `requests | where toint(resultCode) >= 500 | summarize count() by name, resultCode`,
   then open a failing request's `operation_Id` in **Transaction search** to see its exception and dependencies.
3. Record what happened and the fix in the tracking issue. Use trace ids, never family data.
