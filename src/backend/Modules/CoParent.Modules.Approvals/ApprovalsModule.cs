using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Approvals.Endpoints;
using CoParent.Modules.Approvals.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Approvals;

/// <summary>The PR-style approval engine (ADR-0003): change requests that need both parents' agreement.</summary>
public static class ApprovalsModule
{
    public static IServiceCollection AddApprovalsModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<ApprovalsDbContext>();
        services.AddScoped<IChangeRequests, ChangeRequests>();
        services.AddOptions<ApprovalOptions>().BindConfiguration(ApprovalOptions.Section);
        services.AddSingleton<RequestExpiry>();
        services.AddSingleton<IRequestExpiry>(sp => sp.GetRequiredService<RequestExpiry>());
        services.AddHostedService<RequestExpiryWorker>();
        return services;
    }

    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapApprovalsEndpoints(this IEndpointRouteBuilder family)
    {
        ApprovalEndpoints.Map(family);
        return family;
    }
}
