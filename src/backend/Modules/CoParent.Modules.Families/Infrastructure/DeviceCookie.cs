using Microsoft.AspNetCore.Http;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// The registered-device token (ADR-0006). __Host- prefix, HttpOnly, Secure and SameSite=Strict, like the session
/// cookie, so scripts and other sites can't read or send it.
/// </summary>
internal static class DeviceCookie
{
    public const string Name = "__Host-parenthesis-device";

    /// <summary>
    /// Sets the cookie until <paramref name="expires"/>: a shared device's fixed expiry, or ~400 days for a child's
    /// paired tablet. The server checks the device's own expiry and revocation on every use regardless.
    /// </summary>
    public static void Set(HttpResponse response, string token, DateTimeOffset expires) =>
        response.Cookies.Append(Name, token, Options(expires));

    public static void Delete(HttpResponse response) => response.Cookies.Delete(Name, Options(null));

    public static string? Read(HttpRequest request) =>
        request.Cookies.TryGetValue(Name, out var token) && !string.IsNullOrEmpty(token) ? token : null;

    private static CookieOptions Options(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        IsEssential = true,
        Expires = expires,
    };
}
