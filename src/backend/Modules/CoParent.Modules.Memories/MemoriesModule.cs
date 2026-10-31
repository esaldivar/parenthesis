using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Memories.Contracts;
using CoParent.Modules.Memories.Endpoints;
using CoParent.Modules.Memories.Infrastructure;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Memories;

/// <summary>Event photos and Family Memories (#403; docs/design/handoffs/EVENT_PHOTOS_403.md).</summary>
public static class MemoriesModule
{
    public static IServiceCollection AddMemoriesModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<MemoriesDbContext>();
        services.AddOptions<EventPhotoOptions>().BindConfiguration(EventPhotoOptions.Section);
        services.AddSingleton<IPhotoStore, AzureBlobPhotoStore>();
        services.AddScoped<IParentDepartureHandler, MemoriesDeparture>();
        services.AddSingleton<PhotoCleanup>();
        services.AddSingleton<IEventPhotoCleanup>(sp => sp.GetRequiredService<PhotoCleanup>());
        services.AddHostedService<PhotoCleanupWorker>();

        // Each upload decodes and re-encodes a photo, so each parent gets a generous but bounded hourly allowance.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(MemoryEndpoints.UploadRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromHours(1) })));
        return services;
    }

    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapMemoriesEndpoints(this IEndpointRouteBuilder family)
    {
        MemoryEndpoints.Map(family);
        return family;
    }
}
