using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;

namespace CoParent.Modules.Identity.Endpoints;

/// <summary>
/// Per-user language choice. Uses the existing ASP.NET Identity user-token table, so no schema migration is needed.
/// Never stores a family-wide preference or a shared-device cookie.
/// </summary>
internal static class UserLanguage
{
    private const string Provider = "Parenthesis";
    private const string TokenName = "preferred-language";

    public const string English = "en";
    public const string Spanish = "es-419";

    public static bool IsSupported(string? language) => language is English or Spanish;

    public static async Task<string> GetAsync(UserManager<AppUser> users, AppUser user)
    {
        var value = await users.GetAuthenticationTokenAsync(user, Provider, TokenName);
        return IsSupported(value) ? value! : English;
    }

    public static Task<IdentityResult> SetAsync(UserManager<AppUser> users, AppUser user, string language) =>
        users.SetAuthenticationTokenAsync(user, Provider, TokenName, language);
}
