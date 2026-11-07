using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.SharedRecords;

/// <summary>Where payment attachments are kept (#477): a private blob container, separate from event photos.</summary>
internal sealed class AttachmentOptions
{
    public const string Section = "SharedRecords";

    /// <summary>The storage account's blob endpoint, reached with the app's managed identity (Azure).</summary>
    public Uri? BlobServiceUri { get; set; }

    /// <summary>A connection string instead of <see cref="BlobServiceUri"/>: Azurite locally and in tests only.</summary>
    public string? ConnectionString { get; set; }

    public string ContainerName { get; set; } = "shared-records";

    /// <summary>How often files of removed reports are deleted.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromHours(1);
}

/// <summary>Private storage for payment attachments. Nothing in it is public; the API serves every read.</summary>
internal interface IAttachmentStore
{
    bool IsConfigured { get; }

    Task PutAsync(string path, byte[] content, string contentType, CancellationToken cancellationToken);

    /// <summary>The file, or null when it isn't there.</summary>
    Task<Stream?> OpenAsync(string path, CancellationToken cancellationToken);

    Task DeleteAsync(string path, CancellationToken cancellationToken);
}

/// <summary>
/// One private Azure Blob container. In Azure the app signs in with its managed identity and the container already
/// exists (Azure runbook). Locally and in tests a connection string points at Azurite and the container is created on
/// first use, with no public access.
/// </summary>
internal sealed class AzureBlobAttachmentStore : IAttachmentStore, IDisposable
{
    private readonly BlobContainerClient? _container;
    private readonly SemaphoreSlim _ensure = new(1, 1);
    private volatile bool _ensured;

    public AzureBlobAttachmentStore(IOptions<AttachmentOptions> options)
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

    public async Task PutAsync(string path, byte[] content, string contentType, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        await container.GetBlobClient(path).UploadAsync(
            new BinaryData(content),
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } },
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
        var container = _container ?? throw new InvalidOperationException("Shared records storage isn't configured.");
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

/// <summary>The file types a payment attachment may be, told apart by their content, never by name or browser label.</summary>
internal static class AttachmentFiles
{
    public static readonly IReadOnlyDictionary<string, string> Extensions = new Dictionary<string, string>
    {
        ["application/pdf"] = "pdf",
        ["image/png"] = "png",
        ["image/jpeg"] = "jpg",
    };

    /// <summary>The file's type when it's a PDF, PNG or JPEG; otherwise null.</summary>
    public static string? Detect(ReadOnlySpan<byte> content)
    {
        if (content.StartsWith("%PDF-"u8))
        {
            return "application/pdf";
        }

        if (content.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return "image/png";
        }

        return content.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]) ? "image/jpeg" : null;
    }
}
