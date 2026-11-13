using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

internal sealed class MedicalProvidersRevision : Entity, IFamilyScoped, IEssentialsRevision
{
    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public required string ProvidersJson { get; init; }
}
