using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
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

/// <summary>
/// One private Azure Blob container. In Azure the app signs in with its managed identity (no account keys) and the
/// container already exists (Azure runbook), so the identity needs only blob data access to it. Locally and in tests a
/// connection string points at Azurite and the container is created on first use, with no public access.
/// </summary>
internal sealed class AzureBlobPhotoStore : IPhotoStore, IDisposable
{
    private const string ContentType = "image/webp";

    private readonly BlobContainerClient? _container;
    private readonly SemaphoreSlim _ensure = new(1, 1);
    private volatile bool _ensured;

    public AzureBlobPhotoStore(IOptions<EventPhotoOptions> options)
    {
        var settings = options.Value;
        if (!string.IsNullOrWhiteSpace(settings.ConnectionString))
        {
            _container = new BlobContainerClient(settings.ConnectionString, settings.ContainerName);
        }
        else if (settings.BlobServiceUri is { } endpoint)
        {
            _container = new BlobServiceClient(endpoint, new DefaultAzureCredential()).GetBlobContainerClient(settings.ContainerName);
            _ensured = true;
        }
    }

    public bool IsConfigured => _container is not null;

    public void Dispose() => _ensure.Dispose();

    public async Task PutAsync(string path, byte[] content, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        await container.GetBlobClient(path).UploadAsync(
            new BinaryData(content),
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = ContentType } },
            cancellationToken);
    }

    public async Task<Stream?> OpenAsync(string path, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        try
        {
            var download = await container.GetBlobClient(path).DownloadStreamingAsync(cancellationToken: cancellationToken);
            return download.Value.Content;
        }
        catch (RequestFailedException failure) when (failure.Status == 404)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string path, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        await container.GetBlobClient(path).DeleteIfExistsAsync(DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: cancellationToken);
    }

    private async Task<BlobContainerClient> ContainerAsync(CancellationToken cancellationToken)
    {
        var container = _container ?? throw new InvalidOperationException("Event photo storage isn't configured.");
        if (_ensured)
        {
            return container;
        }

        await _ensure.WaitAsync(cancellationToken);
        try
        {
            if (!_ensured)
            {
                await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
                _ensured = true;
            }
        }
        finally
        {
            _ensure.Release();
        }

        return container;
    }
}
