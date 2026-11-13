namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// A write-only stream for ZIP output to a response, which only allows asynchronous writes. <see cref="System.IO.Compression.ZipArchive"/>
/// still writes a few small records (data descriptors) synchronously; those are held here and sent with the next
/// asynchronous write or <see cref="FlushAsync(CancellationToken)"/>. Photo data always goes straight through.
/// </summary>
internal sealed class AsyncWriteStream(Stream inner) : Stream
{
    private readonly MemoryStream _pending = new();

    public override bool CanRead => false;

    public override bool CanSeek => false;

    public override bool CanWrite => true;

    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Write(byte[] buffer, int offset, int count) => _pending.Write(buffer, offset, count);

    public override void Write(ReadOnlySpan<byte> buffer) => _pending.Write(buffer);

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await SendPendingAsync(cancellationToken);
        await inner.WriteAsync(buffer, cancellationToken);
    }

    public override async Task FlushAsync(CancellationToken cancellationToken)
    {
        await SendPendingAsync(cancellationToken);
        await inner.FlushAsync(cancellationToken);
    }

    /// <summary>Held until the next asynchronous write: the response can't be written synchronously.</summary>
    public override void Flush()
    {
    }

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pending.Dispose();
        }

        base.Dispose(disposing);
    }

    private async Task SendPendingAsync(CancellationToken cancellationToken)
    {
        if (_pending.Length == 0)
        {
            return;
        }

        await inner.WriteAsync(_pending.GetBuffer().AsMemory(0, (int)_pending.Length), cancellationToken);
        _pending.SetLength(0);
    }
}
