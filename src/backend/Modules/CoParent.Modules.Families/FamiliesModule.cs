using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Endpoints;
using CoParent.Modules.Families.Infrastructure;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Families;

public static class FamiliesModule
{
    public static IServiceCollection AddFamiliesModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<FamiliesDbContext>();
        services.AddScoped<IFamilyMembershipReader, FamilyMembershipReader>();
        services.AddScoped<InvitationEmails>();

        // Invitations send email, so each signed-in user gets a modest hourly allowance.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(InvitationEndpoints.RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromHours(1) })));
        return services;
    }

    /// <param name="api">The host's /api group.</param>
    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapFamiliesEndpoints(this IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        FamilyEndpoints.Map(api, family);
        InvitationEndpoints.Map(api, family);
        return api;
    }
}
