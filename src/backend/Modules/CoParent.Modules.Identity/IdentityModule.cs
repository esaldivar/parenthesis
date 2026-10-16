using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Identity.Domain;
using CoParent.Modules.Identity.Endpoints;
using CoParent.Modules.Identity.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Identity;

public static class IdentityModule
{
    public const string SessionCookieName = "__Host-parenthesis";

    public static IServiceCollection AddIdentityModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<IdentityModuleDbContext>();

        services.AddIdentityCore<AppUser>(options =>
            {
                // NIST SP 800-63B: length over composition rules.
                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequiredUniqueChars = 1;

                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Lockout.AllowedForNewUsers = true;

                options.User.RequireUniqueEmail = true;
            })
            .AddEntityFrameworkStores<IdentityModuleDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
        services.ConfigureApplicationCookie(options =>
        {
            // __Host- prefix: Secure, Path=/, no Domain, so the cookie can't be set or scoped by a sibling subdomain.
            options.Cookie.Name = SessionCookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromDays(14);
            options.SlidingExpiration = true;

            // An API answers with status codes, not redirects to a login page.
            options.Events.OnRedirectToLogin = context => SetStatus(context.Response, StatusCodes.Status401Unauthorized);
            options.Events.OnRedirectToAccessDenied = context => SetStatus(context.Response, StatusCodes.Status403Forbidden);
        });
        services.AddAuthorization();

        services.AddOptions<AuthRateLimitOptions>().BindConfiguration(AuthRateLimitOptions.Section);
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(AuthEndpoints.RateLimitPolicy, context =>
            {
                var limit = context.RequestServices.GetRequiredService<IOptions<AuthRateLimitOptions>>().Value;
                return RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = limit.PermitLimit, Window = limit.Window });
            });
        });

        return services;
    }

    /// <summary>Maps /auth/* and /me onto the host's /api group (which supplies authorization and antiforgery).</summary>
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder api)
    {
        AuthEndpoints.Map(api);
        return api;
    }

    private static Task SetStatus(HttpResponse response, int statusCode)
    {
        response.StatusCode = statusCode;
        return Task.CompletedTask;
    }
}

/// <summary>Per-client limit on register/login attempts. Configurable so tests and environments can tune it.</summary>
internal sealed class AuthRateLimitOptions
{
    public const string Section = "Identity:AuthRateLimit";

    public int PermitLimit { get; set; } = 10;

    public TimeSpan Window { get; set; } = TimeSpan.FromMinutes(1);
}
