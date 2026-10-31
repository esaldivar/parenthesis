namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// Event photo storage (#403), bound from <c>EventPhotos</c>. Photos live in one private blob container. Uploads are
/// off unless <see cref="UploadsEnabled"/> is true and storage is configured; reading existing photos only needs
/// storage.
/// </summary>
internal sealed class EventPhotoOptions
{
    public const string Section = "EventPhotos";

    /// <summary>Turns uploads on. Off in production until the HEIC check on a physical iPhone passes (TODO.md).</summary>
    public bool UploadsEnabled { get; set; }

    /// <summary>The storage account's blob endpoint, reached with the app's managed identity (Azure).</summary>
    public Uri? BlobServiceUri { get; set; }

    /// <summary>A connection string instead of <see cref="BlobServiceUri"/>: Azurite locally and in tests only.</summary>
    public string? ConnectionString { get; set; }

    public string ContainerName { get; set; } = "event-photos";

    /// <summary>How often expired, deleted and abandoned photos are cleaned up.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromHours(1);

    public bool StorageConfigured => BlobServiceUri is not null || !string.IsNullOrWhiteSpace(ConnectionString);
}
