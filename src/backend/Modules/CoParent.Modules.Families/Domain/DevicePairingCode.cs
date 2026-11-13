using System.Security.Cryptography;
using System.Text;
using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A one-time code that pairs a child's own tablet to that one child (A-11, ADR-0006). Shown on a parent's phone,
/// valid for 10 minutes, single use, and stored only as a hash. A new code for the same child replaces the old one.
/// </summary>
internal sealed class DevicePairingCode : Entity, IFamilyScoped
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    /// <summary>No 0/O, 1/I/L: easy to read aloud and type on a tablet.</summary>
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public Guid FamilyId { get; init; }

    public Guid ChildProfileId { get; init; }

    public required byte[] CodeHash { get; init; }

    public Guid CreatedByMembershipId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset? UsedAt { get; private set; }

    public bool IsUsable(DateTimeOffset now) => UsedAt is null && now < ExpiresAt;

    public void MarkUsed(DateTimeOffset now) => UsedAt ??= now;

    /// <summary>An 8-character code shown as XXXX-XXXX, and its hash.</summary>
    public static (string Code, byte[] Hash) NewCode()
    {
        var chars = Enumerable.Range(0, 8).Select(_ => Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)]).ToArray();
        var code = $"{new string(chars, 0, 4)}-{new string(chars, 4, 4)}";
        return (code, Hash(code));
    }

    /// <summary>Case, spaces and dashes don't matter when typing it in.</summary>
    public static byte[] Hash(string code)
    {
        var normalized = new string(code.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        return SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
    }
}
