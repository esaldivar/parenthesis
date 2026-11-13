using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// The newest revision is the current section. <see cref="EntriesJson"/> holds the routines parents added (#498).
/// <see cref="Bedtime"/> and <see cref="Naps"/> are the earlier fixed fields: kept in storage and carried forward
/// unchanged, but no longer shown or edited.
/// </summary>
internal sealed class RoutinesRevision : Entity, IFamilyScoped, IEssentialsRevision
{
    public const int TextLimit = 1000;

    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public Guid OwnerMembershipId { get; init; }
    public int? SharedRevision { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public string? Bedtime { get; init; }
    public string? Naps { get; init; }
    public string EntriesJson { get; init; } = "[]";
}
