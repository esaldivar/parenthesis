using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace CoParent.Infrastructure.Email;

public sealed class PublicUrlOptions
{
    public const string Section = "App";

    /// <summary>Where users open the app, e.g. https://app.example.com. Links in emails are built from this.</summary>
    public Uri PublicBaseUrl { get; set; } = new("https://localhost:4200");
}

/// <summary>
/// Builds absolute links for emails from configuration, never from the request's Host header, so a forged Host
/// can't redirect a password-reset link to an attacker's site.
/// </summary>
public sealed class PublicUrls(IOptions<PublicUrlOptions> options)
{
    public Uri Build(string path, IReadOnlyDictionary<string, string?> query)
    {
        var relative = QueryHelpers.AddQueryString(path, query);
        return new Uri(options.Value.PublicBaseUrl, relative);
    }
}
