using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Calendar.Endpoints;
using CoParent.Modules.Calendar.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Calendar;

/// <summary>The shared family calendar (E3; docs/design/CALENDAR_DECISIONS.md).</summary>
public static class CalendarModule
{
    public static IServiceCollection AddCalendarModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<CalendarDbContext>();
        services.AddScoped<IApprovalTargetHandler, CalendarCreateHandler>();
        services.AddScoped<IApprovalTargetHandler, JointEventCreateHandler>();
        services.AddScoped<IApprovalTargetHandler, CalendarModifyHandler>();
        services.AddScoped<IApprovalTargetHandler, CalendarCancelHandler>();
        return services;
    }

    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapCalendarEndpoints(this IEndpointRouteBuilder family)
    {
        CalendarEndpoints.Map(family);
        return family;
    }
}
