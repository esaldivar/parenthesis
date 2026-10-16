using Microsoft.AspNetCore.Diagnostics.HealthChecks;

namespace CoParent.Api.Hosting;

internal static class HealthCheckExtensions
{
    private const string ReadyTag = "ready";

    public static IServiceCollection AddPlatformHealthChecks(this IServiceCollection services, string postgresConnectionString)
    {
        services.AddHealthChecks()
            .AddNpgSql(postgresConnectionString, name: "postgres", tags: [ReadyTag]);
        return services;
    }

    public static IEndpointRouteBuilder MapPlatformHealthChecks(this IEndpointRouteBuilder app)
    {
        // Liveness runs no checks, so a database outage makes the app "not ready" without restarting the container.
        app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
        app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains(ReadyTag) });
        return app;
    }
}
