using System.Security.Cryptography;
using System.Text;
using CoParent.SharedKernel.Domain;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.Modules.Families.Domain;

internal enum DeviceKind
{
    /// <summary>
    /// A shared family device a parent explicitly set up (#153): shows that parent and the family's approved children.
    /// Its picker works for a fixed 30 days from setup.
    /// </summary>
    Household,

    /// <summary>A child's own tablet, paired with a one-time code: only that child can use it.</summary>
    ChildPaired,
}

/// <summary>
/// A registered device (ADR-0006, ADR-0007). PINs only work on one, so a short PIN can't be tried from anywhere else.
/// The device keeps a token in an HttpOnly cookie; only its hash is stored. Parents can revoke it instantly, and a
/// shared household device also expires a fixed 30 days after setup.
/// </summary>
internal sealed class Device : Entity, IFamilyScoped
{
    public const int NameMaxLength = 60;

    /// <summary>Owner decision (#153): 30 days from setup, never extended by activity.</summary>
    public static readonly TimeSpan SharedDeviceLifetime = TimeSpan.FromDays(30);

    public Guid FamilyId { get; init; }

    public DeviceKind Kind { get; init; }

    /// <summary>Set for a child's paired tablet.</summary>
    public Guid? ChildProfileId { get; init; }

    public required string Name { get; init; }

    public required byte[] TokenHash { get; init; }

    public Guid CreatedByMembershipId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset LastSeenAt { get; set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    /// <summary>When a shared household device stops showing its picker. Null for a child's paired tablet.</summary>
    public DateTimeOffset? ExpiresAt { get; init; }

    public bool IsUsableAt(DateTimeOffset now) => RevokedAt is null && (ExpiresAt is null || now < ExpiresAt);

    public void Revoke(DateTimeOffset now) => RevokedAt ??= now;

    public static (string Token, byte[] Hash) NewToken()
    {
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        return (token, Hash(token));
    }

    public static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));
}
