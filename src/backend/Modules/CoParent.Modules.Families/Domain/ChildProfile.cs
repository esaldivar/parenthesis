using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

internal enum ChildStatus
{
    /// <summary>Added by one parent, waiting for the other's approval. Not usable anywhere yet (ADR-0006).</summary>
    PendingApproval,
    Active,
    Rejected,
    Archived,
}

/// <summary>A child in the family. Minimal personal data: a first name only (no birthday, school or photo here).</summary>
internal sealed class ChildProfile : Entity, IFamilyScoped
{
    public const int FirstNameMaxLength = 40;

    public Guid FamilyId { get; init; }

    public required string FirstName { get; init; }

    public ChildStatus Status { get; set; } = ChildStatus.PendingApproval;

    public Guid CreatedByMembershipId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
