using Microsoft.AspNetCore.Http;

namespace CoParent.Modules.Messaging.Realtime;

/// <summary>
/// The chat hub authenticates with the same cookie as the API (ADR-0004), and a browser sends that cookie on a
/// WebSocket opened by any site. So a request to the hub that comes from a page on another origin is refused before
/// SignalR sees it (cross-site WebSocket hijacking). Browsers always send <c>Origin</c> on these requests; a client
/// without one isn't a browser page and can't ride a visitor's cookie.
/// </summary>
internal sealed class HubOriginCheck(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments(ChatHub.Path, StringComparison.OrdinalIgnoreCase)
            && context.Request.Headers.Origin is { Count: > 0 } origin
            && !SameOrigin(origin.ToString(), context.Request))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }

    /// <summary>
    /// Compares host and port only. Azure's ingress ends TLS, so the app sees <c>http</c> while the page's origin is
    /// <c>https</c>; the host is what another site can't fake in a visitor's browser.
    /// </summary>
    public static bool SameOrigin(string origin, HttpRequest request) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
        && string.Equals(uri.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase);
}
