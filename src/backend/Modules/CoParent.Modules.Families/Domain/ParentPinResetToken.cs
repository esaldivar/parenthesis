using System.Security.Cryptography;
using System.Text;
using CoParent.SharedKernel.Domain;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A single-use link for resetting one parent's PIN (owner decision on #153, October 28, 2026): valid 15 minutes,
/// stored only as a hash, and never enough on its own: saving a new PIN also needs that parent's own sign-in and
/// password. A newer link replaces any unused older one for the same parent.
/// </summary>
internal sealed class ParentPinResetToken : Entity, IFamilyScoped
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    /// <summary>At most one link a parent asks for themselves in this window (automatic pause/lock emails aside).</summary>
    public static readonly TimeSpan ResendInterval = TimeSpan.FromMinutes(15);

    public Guid FamilyId { get; init; }

    public Guid MembershipId { get; init; }

    public required byte[] TokenHash { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset? UsedAt { get; private set; }

    /// <summary>
    /// PostgreSQL xmin. Two requests redeeming the same link at once can't both save: the second update fails, and that
    /// request is told the link was already used.
    /// </summary>
    public uint Version { get; private set; }

    public bool IsUsable(DateTimeOffset now) => UsedAt is null && now < ExpiresAt;

    public void MarkUsed(DateTimeOffset now) => UsedAt ??= now;

    public static (string Token, byte[] Hash) NewToken()
    {
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        return (token, Hash(token));
    }

    public static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));
}
