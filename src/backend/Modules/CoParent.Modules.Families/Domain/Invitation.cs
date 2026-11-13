using System.Security.Cryptography;
using System.Text;
using CoParent.SharedKernel.Domain;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// An invitation for a co-parent to join a family (FM-03, ADR-0006). Only a hash of the one-time token is stored, so a
/// database leak can't be used to join anyone's family. Single use, expires, and either parent can revoke it.
/// </summary>
internal sealed class Invitation : Entity, IFamilyScoped
{
    public const int EmailMaxLength = 256;
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public Guid FamilyId { get; init; }

    /// <summary>As entered, for display to the family's parents.</summary>
    public required string Email { get; init; }

    /// <summary>Upper-invariant, for matching against the signed-in user's email.</summary>
    public required string NormalizedEmail { get; init; }

    public required byte[] TokenHash { get; init; }

    public Guid InvitedByUserId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset? AcceptedAt { get; private set; }

    public Guid? AcceptedByUserId { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public bool IsPending(DateTimeOffset now) => AcceptedAt is null && RevokedAt is null && now < ExpiresAt;

    public void Accept(Guid userId, DateTimeOffset now)
    {
        AcceptedAt = now;
        AcceptedByUserId = userId;
    }

    public void Revoke(DateTimeOffset now) => RevokedAt ??= now;

    /// <summary>A new random token (256 bits, URL-safe) and the hash to store.</summary>
    public static (string Token, byte[] Hash) NewToken()
    {
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        return (token, Hash(token));
    }

    public static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));

    public static string Normalize(string email) => email.Trim().ToUpperInvariant();
}
