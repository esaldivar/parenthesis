using System.Diagnostics;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry.Instrumentation.AspNetCore;
using OpenTelemetry.Instrumentation.Http;
using OpenTelemetry.Logs;

namespace CoParent.Api.Hosting;

/// <summary>
/// Sends requests, dependencies (PostgreSQL, outgoing HTTP) and warning-level logs to Application Insights (#86).
/// Nothing is registered unless <c>APPLICATIONINSIGHTS_CONNECTION_STRING</c> is configured, so local runs and tests
/// send nothing.
/// </summary>
public static class TelemetryExtensions
{
    public const string ConnectionStringKey = "APPLICATIONINSIGHTS_CONNECTION_STRING";

    // Npgsql's own ActivitySource: one dependency per database command, with parameterized SQL (no values).
    private const string NpgsqlActivitySource = "Npgsql";

    public static WebApplicationBuilder AddPlatformTelemetry(this WebApplicationBuilder builder)
    {
        var connectionString = builder.Configuration[ConnectionStringKey];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return builder;
        }

        builder.Services.AddOpenTelemetry()
            .UseAzureMonitor(o =>
            {
                o.ConnectionString = connectionString;
                // Live Metrics streams request URLs as they happen; Logs and alerts are all we need.
                o.EnableLiveMetrics = false;
            })
            .WithTracing(t => t.AddSource(NpgsqlActivitySource));

        // Query strings can carry tokens or search text, so they never leave the app.
        builder.Services.Configure<AspNetCoreTraceInstrumentationOptions>(o =>
            o.EnrichWithHttpRequest = (activity, _) => TelemetryRedaction.RemoveQuery(activity));
        builder.Services.Configure<HttpClientTraceInstrumentationOptions>(o =>
            o.EnrichWithHttpRequestMessage = (activity, _) => TelemetryRedaction.RemoveQuery(activity));

        // Information logs (one per request from HTTP logging) stay in the container logs; warnings and errors are
        // what Application Insights needs, and this keeps ingestion well under the workspace's daily cap.
        builder.Logging.AddFilter<OpenTelemetryLoggerProvider>(string.Empty, LogLevel.Warning);

        return builder;
    }
}

/// <summary>Removes query strings from request and dependency telemetry.</summary>
public static class TelemetryRedaction
{
    public static void RemoveQuery(Activity activity)
    {
        activity.SetTag("url.query", null);

        if (activity.GetTagItem("url.full") is string full)
        {
            var queryStart = full.IndexOf('?', StringComparison.Ordinal);
            if (queryStart >= 0)
            {
                activity.SetTag("url.full", full[..queryStart]);
            }
        }
    }
}
