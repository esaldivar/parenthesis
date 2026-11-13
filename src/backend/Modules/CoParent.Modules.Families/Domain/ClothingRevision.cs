using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>The newest revision is the current section. Saving one row also records its history.</summary>
internal sealed class ClothingRevision : Entity, IFamilyScoped, IEssentialsRevision
{
    public const int SizeLimit = 64;
    public const int NotesLimit = 1000;

    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public string? TopSize { get; init; }
    public string? BottomSize { get; init; }
    public string? ShoeSize { get; init; }
    public string? FitNotes { get; init; }
}
