using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Endpoints;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
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
        services.AddScoped<IFamilyRoster, FamilyRoster>();
        services.AddScoped<IChildSessionValidator, ChildSessionValidator>();
        services.AddScoped<PinSafetyEmails>();
        services.AddScoped<SharedDevices>();
        services.AddScoped<ISharedDeviceSessions>(sp => sp.GetRequiredService<SharedDevices>());
        services.AddScoped<AccountDeletionEmails>();
        services.AddSingleton<IPasswordHasher<ChildCredential>, PasswordHasher<ChildCredential>>();
        services.AddSingleton<IPasswordHasher<ParentCredential>, PasswordHasher<ParentCredential>>();

        // Changing a parent PIN checks the account password; the sign-in lockout applies too.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(SharedDeviceEndpoints.PinChangeRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromHours(1) })));

        // PIN attempts per address, on top of each PIN's own pause-then-lock policy.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(ChildAccessEndpoints.PinRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) })));

        // Invitations send email, so each signed-in user gets a modest hourly allowance.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(InvitationEndpoints.RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromHours(1) })));

        // Profile photos (#388): each upload decodes an image, so each parent or child gets a modest hourly allowance.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(PhotoEndpoints.UploadRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString()
                    ?? context.User.GetChildSession()?.ChildId.ToString()
                    ?? context.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromHours(1) })));

        // Deleting an account checks the password; the sign-in lockout applies too.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(AccountDeletionEndpoints.RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromHours(1) })));
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
        SharedDeviceEndpoints.Map(api, family);
        PhotoEndpoints.Map(api, family);
        AccountDeletionEndpoints.Map(api);
        return api;
    }
}
