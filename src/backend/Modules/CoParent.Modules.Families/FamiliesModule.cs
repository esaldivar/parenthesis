using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Endpoints;
using CoParent.Modules.Families.Infrastructure;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.Identity;
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
        services.AddScoped<IApprovalTargetHandler, ChildCreateHandler>();
        services.AddScoped<IApprovalTargetHandler, ChildPinChangeHandler>();
        services.AddScoped<IApprovalParticipants, FamilyParticipants>();
        services.AddScoped<IChildSessionValidator, ChildSessionValidator>();
        services.AddScoped<ChildSafetyEmails>();
        services.AddSingleton<IPasswordHasher<ChildCredential>, PasswordHasher<ChildCredential>>();

        // PIN attempts per address, on top of the 3-strikes lock per child.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(ChildAccessEndpoints.PinRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) })));

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
        ChildEndpoints.Map(family);
        ChildAccessEndpoints.Map(api, family);
        return api;
    }
}
