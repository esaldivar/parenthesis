using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Http;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Test-only: an <see cref="IAntiforgery"/> that throws, so GET /api/antiforgery fails inside a real endpoint and the
/// unhandled-exception path can be tested without a throwing endpoint in production code.
/// </summary>
internal sealed class ThrowingAntiforgery : IAntiforgery
{
    public const string SecretMessage = "sensitive-internal-detail";

    public AntiforgeryTokenSet GetAndStoreTokens(HttpContext httpContext) => throw new InvalidOperationException(SecretMessage);

    public AntiforgeryTokenSet GetTokens(HttpContext httpContext) => throw new InvalidOperationException(SecretMessage);

    public Task<bool> IsRequestValidAsync(HttpContext httpContext) => throw new InvalidOperationException(SecretMessage);

    public Task ValidateRequestAsync(HttpContext httpContext) => throw new InvalidOperationException(SecretMessage);

    public void SetCookieTokenAndHeader(HttpContext httpContext) => throw new InvalidOperationException(SecretMessage);
}
