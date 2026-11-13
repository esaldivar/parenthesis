using CoParent.SharedKernel.Domain;
using CoParent.SharedKernel.Tenancy;

namespace CoParent.Modules.Families.Domain;

/// <summary>The tenant. Parents have equal authority: there is no owner, and no parent can remove another.</summary>
internal sealed class Family : Entity
{
    public const int NameMaxLength = 80;

    public required string Name { get; set; }

    /// <summary>IANA time zone (e.g. America/Chicago), used to display family events.</summary>
    public required string TimeZone { get; set; }

    public DateTimeOffset CreatedAt { get; init; }
}

internal enum MembershipStatus
{
    Active,
    Left,
    Suspended,
}

internal sealed class FamilyMembership : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid UserId { get; init; }

    public FamilyRole Role { get; init; }

    public MembershipStatus Status { get; set; } = MembershipStatus.Active;

    public DateTimeOffset JoinedAt { get; init; }

    /// <summary>Persisted display slot, independent of viewer and roster ordering. Null for non-parents.</summary>
    public int? PaletteSlot { get; set; }
}
