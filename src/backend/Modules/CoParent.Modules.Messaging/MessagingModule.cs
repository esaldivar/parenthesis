using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Messaging.Endpoints;
using CoParent.Modules.Messaging.Infrastructure;
using CoParent.Modules.Messaging.Realtime;
using CoParent.Modules.Messaging.Transcripts;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Messaging;

/// <summary>Parent-to-parent messaging (#125; docs/design/m4-chat.md, slice 1: core messaging).</summary>
public static class MessagingModule
{
    public static IServiceCollection AddMessagingModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<MessagingDbContext>();
        services.AddScoped<IParentDepartureHandler, MessagingDeparture>();
        services.AddSingleton<ChatNotifier>();
        services.AddScoped<TranscriptBuilder>();

        // Clients only call Watch (a family id), so incoming hub messages stay tiny.
        services.AddSignalR(options => options.MaximumReceiveMessageSize = 1024);

        // Generous for a conversation, bounded against a stuck client or a script.
        services.Configure<RateLimiterOptions>(options =>
        {
            options.AddPolicy(ChatEndpoints.SendRateLimitPolicy, context => PerUser(context, 60));
            options.AddPolicy(ChatEndpoints.TypingRateLimitPolicy, context => PerUser(context, 30));
            // Rendering a transcript reads the whole range; previews and downloads are a person's pace.
            options.AddPolicy(TranscriptEndpoints.RenderRateLimitPolicy, context => PerUser(context, 30));
            options.AddPolicy(TranscriptEndpoints.SaveRateLimitPolicy, context => PerUser(context, 10));
        });
        return services;
    }

    /// <param name="family">The host's /api/families/{familyId} group, behind the tenant gate.</param>
    public static IEndpointRouteBuilder MapMessagingEndpoints(this IEndpointRouteBuilder family)
    {
        ChatEndpoints.Map(family);
        return family;
    }

    /// <summary>Refuses hub requests from pages on other origins. Add before routing runs the hub.</summary>
    public static IApplicationBuilder UseMessagingHubOriginCheck(this IApplicationBuilder app) =>
        app.UseMiddleware<HubOriginCheck>();

    /// <summary>The live chat hub at <c>/hubs/chat</c>, for signed-in parents only.</summary>
    public static IEndpointRouteBuilder MapMessagingHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<ChatHub>(ChatHub.Path).RequireAuthorization();
        return app;
    }

    private static RateLimitPartition<string> PerUser(HttpContext context, int perMinute) =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) });
}
