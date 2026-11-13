using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace CoParent.Infrastructure.Storage;

/// <summary>
/// One private Azure Blob container, shared by every module that keeps files (event photos, Shared records
/// attachments). Nothing in it is ever public; the API serves every read. In Azure the app signs in with its managed
/// identity (no account keys) and the container already exists (Azure runbook), so the identity needs only blob data
/// access to it. Locally and in tests a connection string points at Azurite and the container is created on first use,
/// with no public access. Without either setting it isn't configured, and callers say so instead of failing.
/// </summary>
public sealed class PrivateBlobContainer : IDisposable
{
    private readonly BlobContainerClient? _container;
    private readonly SemaphoreSlim _ensure = new(1, 1);
    private volatile bool _ensured;

    public PrivateBlobContainer(string? connectionString, Uri? blobServiceUri, string containerName)
    {
        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            _container = new BlobContainerClient(connectionString, containerName);
        }
        else if (blobServiceUri is not null)
        {
            _container = new BlobServiceClient(blobServiceUri, new DefaultAzureCredential()).GetBlobContainerClient(containerName);
            _ensured = true;
        }
    }

    public bool IsConfigured => _container is not null;

    public void Dispose() => _ensure.Dispose();

    public async Task PutAsync(string path, byte[] content, string contentType, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        await container.GetBlobClient(path).UploadAsync(
            new BinaryData(content),
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } },
            cancellationToken);
    }

    /// <summary>The file, or null when it isn't there (already cleaned up).</summary>
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

    /// <summary>Deletes the file if it exists.</summary>
    public async Task DeleteAsync(string path, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        await container.GetBlobClient(path).DeleteIfExistsAsync(DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: cancellationToken);
    }

    private async Task<BlobContainerClient> ContainerAsync(CancellationToken cancellationToken)
    {
        var container = _container ?? throw new InvalidOperationException("This file storage isn't configured.");
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
