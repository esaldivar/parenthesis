using CoParent.Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.SharedRecords.Infrastructure;

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

/// <summary>The Shared records container (<see cref="PrivateBlobContainer"/>).</summary>
internal sealed class AzureBlobAttachmentStore(IOptions<AttachmentOptions> options) : IAttachmentStore, IDisposable
{
    private readonly PrivateBlobContainer _container = new(
        options.Value.ConnectionString, options.Value.BlobServiceUri, options.Value.ContainerName);

    public bool IsConfigured => _container.IsConfigured;

    public void Dispose() => _container.Dispose();

    public Task PutAsync(string path, byte[] content, string contentType, CancellationToken cancellationToken) =>
        _container.PutAsync(path, content, contentType, cancellationToken);

    public Task<Stream?> OpenAsync(string path, CancellationToken cancellationToken) => _container.OpenAsync(path, cancellationToken);

    public Task DeleteAsync(string path, CancellationToken cancellationToken) => _container.DeleteAsync(path, cancellationToken);
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
