using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A saved revision of a child's medication reference (#127): the whole list as JSON, newest revision current. A
/// permanent delete rewrites every revision without that entry (docs/privacy/medication-preflight-127.md, D7).
/// </summary>
internal sealed class MedicationRevision : Entity, IFamilyScoped, IEssentialsRevision
{
    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public required string EntriesJson { get; set; }
}
