using Microsoft.Net.Http.Headers;

namespace CoParent.Api.Hosting;

/// <summary>
/// Serves the built Angular app from wwwroot on the API's own origin, so the session and antiforgery cookies stay
/// same-origin with no CORS (ADR-0004).
/// </summary>
internal static class SpaHostingExtensions
{
    // Client-side routes fall back to index.html. Paths that look like files never do: a matched fallback would stop
    // the static file middleware serving real files, and a missing chunk must 404. API, health and OpenAPI paths
    // never do either: an unknown /api/... route must stay a 404 problem response, not an HTML page.
    private const string ClientRoutePattern = "{*path:nonfile:regex(^(?!api/|api$|health/|openapi/|swagger).*$)}";

    public static IApplicationBuilder UseSpaStaticFiles(this IApplicationBuilder app)
    {
        // "/" → index.html.
        app.UseDefaultFiles();
        return app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                // Angular's built files have content hashes in their names, so they can be cached for a long time.
                // index.html must always be revalidated so a new deployment is picked up.
                var cacheControl = context.File.Name == "index.html"
                    ? "no-cache"
                    : "public, max-age=31536000, immutable";
                context.Context.Response.Headers[HeaderNames.CacheControl] = cacheControl;
            },
        });
    }

    public static IEndpointRouteBuilder MapSpaFallback(this IEndpointRouteBuilder app)
    {
        app.MapFallbackToFile(ClientRoutePattern, "index.html", new StaticFileOptions
        {
            OnPrepareResponse = context => context.Context.Response.Headers[HeaderNames.CacheControl] = "no-cache",
        });
        return app;
    }
}
