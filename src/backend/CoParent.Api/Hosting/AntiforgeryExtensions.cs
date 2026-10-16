using Microsoft.AspNetCore.Antiforgery;

namespace CoParent.Api.Hosting;

/// <summary>
/// CSRF protection for the cookie-authenticated SPA (ADR-0004), using Angular's convention: the API sets a
/// readable <c>XSRF-TOKEN</c> cookie and Angular echoes it in the <c>X-XSRF-TOKEN</c> header on unsafe requests.
/// </summary>
internal static class AntiforgeryExtensions
{
    public const string RequestTokenCookie = "XSRF-TOKEN";
    public const string RequestTokenHeader = "X-XSRF-TOKEN";

    public static IServiceCollection AddPlatformAntiforgery(this IServiceCollection services)
    {
        return services.AddAntiforgery(options =>
        {
            options.HeaderName = RequestTokenHeader;
            options.Cookie.Name = "__Host-parenthesis-af";
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
        });
    }

    /// <summary>
    /// GET /api/antiforgery issues a token for the current user. Tokens are tied to the signed-in user, so the SPA
    /// calls this on startup and again after signing in or out.
    /// </summary>
    public static IEndpointRouteBuilder MapAntiforgeryTokenEndpoint(this IEndpointRouteBuilder api)
    {
        api.MapGet("/antiforgery", (HttpContext context, IAntiforgery antiforgery) =>
            {
                var tokens = antiforgery.GetAndStoreTokens(context);
                context.Response.Cookies.Append(RequestTokenCookie, tokens.RequestToken!, new CookieOptions
                {
                    HttpOnly = false, // Angular must read it.
                    Secure = true,
                    SameSite = SameSiteMode.Strict,
                    Path = "/",
                });
                return TypedResults.NoContent();
            })
            .AllowAnonymous()
            .WithTags("Security");
        return api;
    }
}

/// <summary>Rejects unsafe requests (POST, PUT, PATCH, DELETE) without a valid antiforgery token.</summary>
internal sealed class AntiforgeryValidationFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method))
        {
            return await next(context);
        }

        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid or missing antiforgery token.");
        }

        return await next(context);
    }
}
