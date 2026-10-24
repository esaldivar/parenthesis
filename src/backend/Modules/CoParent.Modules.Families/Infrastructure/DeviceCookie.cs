using Microsoft.AspNetCore.Http;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// The registered-device token (ADR-0006). __Host- prefix, HttpOnly, Secure and SameSite=Strict, like the session
/// cookie, so scripts and other sites can't read or send it.
/// </summary>
internal static class DeviceCookie
{
    public const string Name = "__Host-parenthesis-device";

    public static void Set(HttpResponse response, string token, DateTimeOffset now) =>
        response.Cookies.Append(Name, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
            IsEssential = true,
            Expires = now.AddDays(400),
        });

    public static string? Read(HttpRequest request) =>
        request.Cookies.TryGetValue(Name, out var token) && !string.IsNullOrEmpty(token) ? token : null;
}
