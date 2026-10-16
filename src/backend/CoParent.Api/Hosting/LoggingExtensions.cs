using System.Diagnostics;
using Microsoft.AspNetCore.HttpLogging;

namespace CoParent.Api.Hosting;

internal static class LoggingExtensions
{
    public const string TraceIdHeader = "trace-id";

    public static WebApplicationBuilder AddPlatformLogging(this WebApplicationBuilder builder)
    {
        // Every log entry carries the W3C trace id, the same id returned in ProblemDetails and the trace-id header.
        builder.Logging.Configure(o => o.ActivityTrackingOptions = ActivityTrackingOptions.TraceId | ActivityTrackingOptions.SpanId);

        builder.Services.AddHttpLogging(o =>
        {
            // Method, path, status and duration only. Headers, query strings and bodies can carry personal data.
            o.LoggingFields = HttpLoggingFields.RequestMethod
                | HttpLoggingFields.RequestPath
                | HttpLoggingFields.ResponseStatusCode
                | HttpLoggingFields.Duration;
            o.CombineLogs = true;
        });

        return builder;
    }

    /// <summary>Returns the request's trace id so users and support can correlate a failure with server logs.</summary>
    public static IApplicationBuilder UseTraceIdHeader(this IApplicationBuilder app)
    {
        return app.Use((context, next) =>
        {
            // Added when the response starts: the exception handler clears headers set earlier, and 500s are
            // exactly when the trace id is needed.
            var traceId = CurrentTraceId(context);
            context.Response.OnStarting(() =>
            {
                context.Response.Headers[TraceIdHeader] = traceId;
                return Task.CompletedTask;
            });
            return next(context);
        });
    }

    public static string CurrentTraceId(HttpContext context) =>
        Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
}
