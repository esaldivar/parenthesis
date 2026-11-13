using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Memories.Domain;

/// <summary>
/// Photos one parent added to one event together (#403). Private to the uploader until they turn on
/// <see cref="VisibleToCoParent"/>; only the uploader can change it.
/// </summary>
internal sealed class PhotoBatch : Entity, IFamilyScoped
{
    /// <summary>The most photos one batch may hold.</summary>
    public const int MaxPhotos = 5;

    /// <summary>How long after it starts a batch can still take more photos (the upload that started it).</summary>
    public static readonly TimeSpan OpenFor = TimeSpan.FromMinutes(30);

    public Guid FamilyId { get; init; }

    public Guid EventId { get; init; }

    public Guid UploaderMembershipId { get; init; }

    public bool VisibleToCoParent { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>PostgreSQL xmin.</summary>
    public uint Version { get; private set; }
}
