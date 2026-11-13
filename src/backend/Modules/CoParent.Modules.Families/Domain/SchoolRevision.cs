using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>The newest revision is the current section. Saving one row also records its history.</summary>
internal sealed class SchoolRevision : Entity, IFamilyScoped, IEssentialsRevision
{
    public const int TextLimit = 1000;

    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public string? HomeroomTeacher { get; init; }
    public string? Grade { get; init; }
    public string? ParentConcerns { get; init; }
}
