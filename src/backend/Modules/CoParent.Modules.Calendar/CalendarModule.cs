using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Calendar.Endpoints;
using CoParent.Modules.Calendar.Infrastructure;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Calendar;

/// <summary>The shared family calendar (E3; docs/design/CALENDAR_DECISIONS.md).</summary>
public static class CalendarModule
{
    /// <summary>
    /// The service key of the clock the "from today on" date rule reads (#232). Tests register a fixed one under it.
    /// </summary>
    public const string TodayClock = "calendar-today";

    public static IServiceCollection AddCalendarModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<CalendarDbContext>();
        services.AddKeyedSingleton(TodayClock, TimeProvider.System);
        services.AddScoped<IApprovalTargetHandler, CalendarCreateHandler>();
        services.AddScoped<IApprovalTargetHandler, JointEventCreateHandler>();
        services.AddScoped<IApprovalTargetHandler, CalendarModifyHandler>();
        services.AddScoped<IApprovalTargetHandler, CalendarCancelHandler>();
        services.AddScoped<IParentDepartureHandler, CalendarDeparture>();

        // Address suggestions (#354): off unless Places:ApiKey is set. The client logs nothing about requests.
        services.AddOptions<PlacesOptions>().BindConfiguration(PlacesOptions.Section);
        services.AddSingleton<PlaceSuggestionQuota>();
        services.AddScoped<GooglePlaceSuggestions>();
        services.AddHttpClient(GooglePlaceSuggestions.ClientName, client => client.Timeout = TimeSpan.FromSeconds(3))
            .RemoveAllLoggers();
        // Typing is debounced to about one request a second at most; this stops a stuck or scripted client.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(PlaceSuggestionEndpoints.RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) })));

        // Google Calendar copies (#386): off unless GoogleCalendar:ClientId and ClientSecret are set. No request logging:
        // token requests and event bodies must never reach logs or telemetry.
        services.AddOptions<GoogleCalendarOptions>().BindConfiguration(GoogleCalendarOptions.Section);
        services.AddHttpClient(GoogleCalendarClient.ClientName, client => client.Timeout = TimeSpan.FromSeconds(15)).RemoveAllLoggers();
        services.AddSingleton<GoogleCalendarClient>();
        services.AddSingleton<GoogleCalendarTokens>();
        services.AddSingleton<GoogleCalendarSyncSignal>();
        services.AddSingleton<GoogleCalendarSync>();
        services.AddSingleton<IGoogleCalendarSync>(sp => sp.GetRequiredService<GoogleCalendarSync>());
        services.AddHostedService<GoogleCalendarSyncWorker>();
        return services;
    }

    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapCalendarEndpoints(this IEndpointRouteBuilder family)
    {
        CalendarEndpoints.Map(family);
        ReminderEndpoints.Map(family);
        TaskEndpoints.Map(family);
        PlaceSuggestionEndpoints.Map(family);
        GoogleCalendarEndpoints.Map(family);
        return family;
    }
}
