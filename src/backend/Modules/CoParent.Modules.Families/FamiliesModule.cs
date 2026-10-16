using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Endpoints;
using CoParent.Modules.Families.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Families;

public static class FamiliesModule
{
    public static IServiceCollection AddFamiliesModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<FamiliesDbContext>();
        services.AddScoped<IFamilyMembershipReader, FamilyMembershipReader>();
        return services;
    }

    /// <param name="api">The host's /api group.</param>
    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapFamiliesEndpoints(this IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        FamilyEndpoints.Map(api, family);
        return api;
    }
}
