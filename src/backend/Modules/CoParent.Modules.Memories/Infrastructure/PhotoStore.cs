using CoParent.Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>Private storage for event photo files (#403). Nothing in it is ever public; the API serves every read.</summary>
internal interface IPhotoStore
{
    bool IsConfigured { get; }

    Task PutAsync(string path, byte[] content, CancellationToken cancellationToken);

    /// <summary>The file, or null when it isn't there (already cleaned up).</summary>
    Task<Stream?> OpenAsync(string path, CancellationToken cancellationToken);

    /// <summary>Deletes the file if it exists.</summary>
    Task DeleteAsync(string path, CancellationToken cancellationToken);
}

/// <summary>The event-photos container (<see cref="PrivateBlobContainer"/>); every photo is stored as WebP.</summary>
internal sealed class AzureBlobPhotoStore(IOptions<EventPhotoOptions> options) : IPhotoStore, IDisposable
{
    private const string ContentType = "image/webp";

    private readonly PrivateBlobContainer _container = new(
        options.Value.ConnectionString, options.Value.BlobServiceUri, options.Value.ContainerName);

    public bool IsConfigured => _container.IsConfigured;

    public void Dispose() => _container.Dispose();

    public Task PutAsync(string path, byte[] content, CancellationToken cancellationToken) =>
        _container.PutAsync(path, content, ContentType, cancellationToken);

    public Task<Stream?> OpenAsync(string path, CancellationToken cancellationToken) => _container.OpenAsync(path, cancellationToken);

    public Task DeleteAsync(string path, CancellationToken cancellationToken) => _container.DeleteAsync(path, cancellationToken);
}
