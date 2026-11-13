using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Gives each <see cref="ApiSession"/> its own client address, as separate browsers and tablets have. The test server
/// has no remote address, so otherwise every test shares the per-address rate limits (such as 30 PIN attempts a
/// minute) and a fast run trips them. Test host only; production reads the real connection address.
/// </summary>
internal sealed class TestClientAddress : IStartupFilter
{
    public const string Header = "X-Test-Client-Address";

    private static int _next;

    /// <summary>A new address in the reserved benchmarking range (198.18.0.0/15), unique within this test run.</summary>
    public static string Next()
    {
        var n = Interlocked.Increment(ref _next);
        return new IPAddress([198, (byte)(18 + ((n >> 16) & 1)), (byte)(n >> 8), (byte)n]).ToString();
    }

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use((context, nextMiddleware) =>
        {
            if (IPAddress.TryParse(context.Request.Headers[Header], out var address))
            {
                context.Connection.RemoteIpAddress = address;
            }

            return nextMiddleware(context);
        });
        next(app);
    };
}
