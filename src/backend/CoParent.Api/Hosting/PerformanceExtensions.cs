using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using CoParent.Infrastructure.Persistence;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Api.Hosting;

/// <summary>
/// First-load speed (#415). The app scales to zero when idle (owner decision, November 4, 2026), so the first visit after
/// a quiet spell starts the container. These keep that start short and make it measurable.
/// </summary>
internal static class PerformanceExtensions
{
    internal const string ServerTimingHeader = "Server-Timing";

    /// <summary>
    /// Compresses the Angular app's files. Only static text types: API responses (JSON) are left alone, so a secret in a
    /// response can never be combined with reflected input in one compressed body (BREACH).
    /// </summary>
    internal static readonly string[] CompressedTypes =
    [
        "text/html",
        "text/css",
        "text/javascript",
        "application/javascript",
        "image/svg+xml",
        "application/manifest+json",
    ];

    public static IServiceCollection AddPlatformPerformance(this IServiceCollection services)
    {
        services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            options.MimeTypes = CompressedTypes;
        });
        // Optimal is Brotli quality 4 and gzip level 6: quick on a small replica, and hashed files are then cached for a year.
        services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
        services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
        services.AddHostedService<StartupWarmUp>();
        return services;
    }

    /// <summary>
    /// Adds <c>Server-Timing: app;dur=…</c> (milliseconds spent in the app) to every response, and on the first request a
    /// replica serves, <c>start;dur=…</c> (milliseconds since the process started: the cold start). Browsers show both
    /// in the Network tab. Durations only: no identifiers, hostnames or personal data.
    /// </summary>
    public static IApplicationBuilder UseServerTiming(this IApplicationBuilder app)
    {
        var processStart = Process.GetCurrentProcess().StartTime.ToUniversalTime();
        var first = 1;
        return app.Use((context, next) =>
        {
            var started = Stopwatch.GetTimestamp();
            var isFirst = Interlocked.Exchange(ref first, 0) == 1;
            context.Response.OnStarting(() =>
            {
                var timing = $"app;dur={Format(Stopwatch.GetElapsedTime(started).TotalMilliseconds)}";
                if (isFirst)
                {
                    timing += $", start;dur={Format((DateTime.UtcNow - processStart).TotalMilliseconds)}";
                }

                context.Response.Headers.Append(ServerTimingHeader, timing);
                return Task.CompletedTask;
            });
            return next(context);
        });
    }

    private static string Format(double milliseconds) =>
        Math.Max(0, milliseconds).ToString("0.0", CultureInfo.InvariantCulture);
}

/// <summary>
/// Builds every module's EF Core model and opens a first database connection in the background once the app is
/// listening, so the first requests after a cold start don't each pay for it. It waits until then because on a small
/// replica it would otherwise compete with start-up for the CPU and delay listening; started afterwards, it overlaps
/// with the browser downloading the app. A failure only means the first request does the work itself (the readiness
/// check reports a database outage).
/// </summary>
internal sealed partial class StartupWarmUp(
    IServiceScopeFactory scopeFactory,
    IEnumerable<ModuleDbContextRegistration> registrations,
    IHostApplicationLifetime lifetime,
    ILogger<StartupWarmUp> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var listening = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using (lifetime.ApplicationStarted.Register(() => listening.TrySetResult()))
        using (stoppingToken.Register(() => listening.TrySetCanceled(stoppingToken)))
        {
            try
            {
                await listening.Task;
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }

        var started = Stopwatch.GetTimestamp();
        try
        {
            await Task.WhenAll(registrations.Select(r => WarmAsync(r.ContextType, stoppingToken)));
            var elapsed = Stopwatch.GetElapsedTime(started);
            LogWarmedUp(elapsed);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            LogWarmUpFailed(exception);
        }
    }

    private async Task WarmAsync(Type contextType, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var context = (DbContext)scope.ServiceProvider.GetRequiredService(contextType);
        _ = context.Model;
        await context.Database.CanConnectAsync(cancellationToken);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Start-up warm-up finished in {Elapsed}")]
    private partial void LogWarmedUp(TimeSpan elapsed);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Start-up warm-up failed; the first requests will warm up instead")]
    private partial void LogWarmUpFailed(Exception exception);
}
