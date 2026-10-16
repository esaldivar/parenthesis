using System.Security.Claims;

namespace CoParent.SharedKernel.Security;

public static class ClaimsPrincipalExtensions
{
    /// <summary>The signed-in user's id (the Identity user's primary key), or null when anonymous.</summary>
    public static Guid? GetUserId(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);
        return Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;
    }
}
