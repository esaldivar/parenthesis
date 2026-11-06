using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>The newest revision is the current section. Saving one row also records its history.</summary>
internal sealed class WhatHelpsRevision : Entity, IFamilyScoped
{
    public const int TextLimit = 1000;

    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public required int Revision { get; init; }
    public required Guid EditedByUserId { get; init; }
    public required DateTimeOffset EditedAt { get; init; }
    public string? ComfortItems { get; init; }
    public string? CalmingStrategies { get; init; }
}
