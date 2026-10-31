using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Memories.Domain;

/// <summary>Where an event photo is in its life (#403).</summary>
internal enum PhotoState
{
    /// <summary>Its spot and storage are reserved while the files are written. Swept if left behind.</summary>
    Uploading,

    /// <summary>Stored and visible to whoever may see its batch, until <see cref="EventPhoto.ExpiresAt"/>.</summary>
    Active,

    /// <summary>Deleted by its uploader (or their account): gone for everyone at once; the files are removed next.</summary>
    Deleted,

    /// <summary>Past its expiry: files removed. The row stays so the event can say when its photos were deleted.</summary>
    Expired,
}

/// <summary>
/// One processed photo and its thumbnail in private blob storage (#403). Both count toward the uploader's storage
/// allowance by their actual stored size. Every read checks <see cref="ExpiresAt"/>, whatever the cleanup has done.
/// </summary>
internal sealed class EventPhoto : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid BatchId { get; init; }

    public Guid EventId { get; init; }

    public Guid UploaderMembershipId { get; init; }

    /// <summary>Order within the batch, from 1.</summary>
    public int Position { get; init; }

    public PhotoState State { get; set; }

    public int Width { get; init; }

    public int Height { get; init; }

    public long PhotoBytes { get; init; }

    public long ThumbnailBytes { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>Upload time plus 28 days, in UTC.</summary>
    public DateTimeOffset ExpiresAt { get; init; }

    /// <summary>When it was deleted or its files were removed after expiry.</summary>
    public DateTimeOffset? RemovedAt { get; set; }

    /// <summary>PostgreSQL xmin.</summary>
    public uint Version { get; private set; }

    public long StoredBytes => PhotoBytes + ThumbnailBytes;

    public string PhotoPath => Path(FamilyId, EventId, Id, "photo");

    public string ThumbnailPath => Path(FamilyId, EventId, Id, "thumb");

    /// <summary><c>families/{familyId}/memories/{eventId}/{photoId}/{photo|thumb}</c> (solution architecture).</summary>
    public static string Path(Guid familyId, Guid eventId, Guid photoId, string file) =>
        $"families/{familyId:N}/memories/{eventId:N}/{photoId:N}/{file}";
}
