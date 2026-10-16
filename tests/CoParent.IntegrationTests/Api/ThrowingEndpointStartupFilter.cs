using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Test-only: a request to <see cref="Path"/> throws after the app's own pipeline (exception handler included)
/// has run, so tests can exercise the unhandled-exception path without a throwing endpoint in production code.
/// </summary>
internal sealed class ThrowingEndpointStartupFilter : IStartupFilter
{
    public const string Path = "/__tests/throw";
    public const string SecretMessage = "sensitive-internal-detail";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        next(app);
        app.Use((context, nextMiddleware) => context.Request.Path == Path
            ? throw new InvalidOperationException(SecretMessage)
            : nextMiddleware(context));
    };
}
