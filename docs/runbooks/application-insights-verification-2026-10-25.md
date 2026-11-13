# Development telemetry verification — October 25, 2026 (#160)

**Result: not passed.** The Development app responds to correlated synthetic requests, but useful Application
Insights request/dependency/failure telemetry is not established. Zero incremental monitoring cost is also not
established. This is read-only verification evidence, not approval to instrument, deploy or change Azure settings.

## Observed deployment and wiring

| Item | Observed value |
|---|---|
| Environment | Development, Central US |
| Container App | `ca-parenthesis-dev` |
| Active revision | `ca-parenthesis-dev--0000019`, 100% traffic |
| Container image | `ghcr.io/esaldivar/parenthesis-api:sha-0fc9d454ddbce262c5a185c44b92eada9f218eaf` |
| Application Insights | `appi-parenthesis-dev`, workspace-based |
| Linked workspace | `log-parenthesis-dev` |
| Seven-day Application Insights overview | Server requests 0; failed requests 0; response time unavailable |
| Application Insights ingestion sampling | Retains 100% |
| Application Insights resource cap | 100 GB/day |
| Workspace pricing tier | Pay-as-you-go, Analytics Logs |
| Workspace daily cap | Enabled, 0.500 GB/day; portal warns enforcement can overshoot |
| Workspace default retention | 30 days; portal separately describes Application Insights table defaults |

The active container's environment-variable **names** were inspected without exporting values. There is no
`APPLICATIONINSIGHTS_CONNECTION_STRING` or OpenTelemetry exporter variable. At the deployed commit above,
searching backend sources and central package versions finds no Application Insights/Azure Monitor/OpenTelemetry
integration. `src/backend/CoParent.Api/Hosting/LoggingExtensions.cs` configures console HTTP logging and W3C trace
IDs; this is not an Application Insights exporter. These observations explain why creating the resource alone
does not establish application telemetry. No connection string, instrumentation key, tenant/subscription ID,
email allowlist, SMTP credential or family data is included in this report.

## Controlled anonymous Development requests

Three GETs were sent to the app's existing Azure hostname. They did not use a parent session or modify records.
No error endpoint, exception injection or load test was added.

| UTC timestamp on October 25 | Path | HTTP result | Response `trace-id` |
|---|---|---|---|
| 20:34:07.529 | `/health/live` | 200 | `8c451b6c594680822e3df3478e9f6102` |
| 20:34:07.766 | `/health/ready` | 200 | `dfde2d7c550ec39c47a6b877a51323ca` |
| 20:34:07.909 | `/api/me` without authentication | 401, expected controlled failure | `d7c9e06653857df4ccb64f616fe96ab9` |

This proves the request path/readiness check and response correlation work. It does **not** prove ingestion into
Application Insights. Correlated request, database dependency and failure rows have not been verified in the
correct resource. Exception telemetry and sensitive-field inspection remain unverified. The workspace Logs pane
failed to render, including after its read-only Refresh action; the Application Insights Logs pane opened an
Observability Agent session rather than a direct query editor. No query result is fabricated from overview charts.

After a separately approved instrumentation fix, use scoped aggregate queries first, for example:

```kusto
union withsource=TableName isfuzzy=true AppRequests, AppDependencies, AppExceptions
| where TimeGenerated > ago(30m)
| summarize Rows=count() by TableName
```

Then query the synthetic operation IDs above in the appropriate app resource, projecting only time, operation ID,
status and telemetry type. Account for ingestion latency. Inspect sensitive-field absence using synthetic
sentinels, not real family content. A lack of rows cannot certify privacy.

## Usage and cost evidence

The workspace Usage and estimated costs pane reports **0.06 GB** of Analytics ingestion in its last-31-day view,
an estimated ingestion cost of **$0.17**, and **60 MB** in `ContainerAppConsoleLogs_CL` in its last-90-day table.
`ContainerAppSystemLogs_CL` also appears in the legend. Basic/Auxiliary ingestion displays 0.00 GB. The Application
Insights resource shows 0 multi-step web tests, 0 custom-metric bytes and a $0 estimate for those items.

The home page shows a $0 current-month cost alongside $200 of trial credit expiring November 18, 2026. Neither
that balance nor an estimate establishes $0 incremental monitoring charges after allowances and billing delay.
Billing-account-wide shared usage, allowance eligibility/headroom, resource-level settled charges, per-table
retention/archive and all other chargeable features have not been fully verified. Do not interpret $0.17 as a
confirmed invoice or $0 as a confirmed free workload.

Microsoft's [Application Insights FAQ](https://learn.microsoft.com/en-us/azure/azure-monitor/app/application-insights-faq)
and [Azure Monitor pricing](https://azure.microsoft.com/en-us/pricing/details/monitor/) were checked October 25,
2026. They describe the applicable Pay-as-you-go first 5 GB/month allowance **per billing account**, not per app.
The pricing page distinguishes included Analytics queries/retention from chargeable Basic/Auxiliary queries,
extended retention, export and other features.

If the rolling 31-day workload were representative, its existing container-log baseline is about 0.06 GB/month;
this is not a forecast for adding unmeasured API telemetry. At its configured cap, 0.5 × 31 = **15.5 GB/month**
before possible overshoot, so the cap cannot guarantee a free 5 GB monthly workload. Certified shared headroom
cannot be calculated from this one workspace's usage.

## Required follow-up, separately scoped

The existing [monitoring baseline issue #86](https://github.com/esaldivar/parenthesis/issues/86) covers missing
instrumentation. Its broader alert/availability scope is not authorized by this verification. A focused follow-up
needs exporter/configuration wiring, an explicit collection-off switch, tested filtering/redaction/sampling,
synthetic correlation evidence and measured volume. Azure configuration/deployment still need owner approval.

Before enabling collection, establish billing-account allowance and a lower operational monthly threshold with
headroom for other workspaces. Document an owner-operated way to disable that exporter before exceeding the
remaining allowance; a cap/budget alert is not a spending ceiling. Recheck resource-level Cost Management after
billing data settles. Preserve separate request, failure, dependency, privacy and cost verdicts. #160 remains open.
