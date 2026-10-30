using SkiaSharp;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>Why an upload wasn't usable as a profile photo. The app shows a matching message.</summary>
internal enum AvatarRejection
{
    Empty,
    TooLarge,
    Unsupported,
    Animated,
    TooManyPixels,
    Damaged,
}

/// <summary>A processed profile photo, or why the upload was refused.</summary>
internal sealed record AvatarResult(byte[]? Content, int Side, AvatarRejection? Rejection)
{
    public static AvatarResult Refused(AvatarRejection rejection) => new(null, 0, rejection);
}

/// <summary>
/// Profile photo processing (#388). The bounds are documented in <c>docs/design/PROFILE_PHOTOS.md</c>.
/// <list type="bullet">
/// <item>Only JPEG, PNG and still WebP files are accepted, decided from the file's own bytes, never its name or
/// declared type.</item>
/// <item>The header's dimensions are checked before any pixels are decoded, so a small file that claims a huge
/// picture is refused cheaply. Large JPEGs decode at a reduced scale.</item>
/// <item>The photo is turned upright (camera orientation), cropped to a centred square, resized to at most
/// <see cref="OutputSide"/> pixels and re-encoded as WebP. Re-encoding keeps pixels only: EXIF, GPS location,
/// comments and any other embedded data are dropped.</item>
/// </list>
/// </summary>
internal static class AvatarImages
{
    /// <summary>The largest upload accepted: a typical phone photo fits.</summary>
    public const int MaxUploadBytes = 8 * 1024 * 1024;

    /// <summary>The longest side a source image may claim.</summary>
    public const int MaxSourceSide = 12_000;

    /// <summary>The most pixels a source image may claim (a 48-megapixel phone photo fits).</summary>
    public const long MaxSourcePixels = 60_000_000;

    /// <summary>The most pixels actually decoded into memory, after any scaled JPEG decode.</summary>
    public const long MaxDecodedPixels = 16_000_000;

    /// <summary>Stored photos are squares of at most this many pixels: sharp at 72px on a 3x screen and beyond.</summary>
    public const int OutputSide = 512;

    /// <summary>The most a stored photo may take. WebP at 512px is normally 20 to 60 KB.</summary>
    public const int MaxStoredBytes = 200 * 1024;

    public const string ContentType = "image/webp";

    private static readonly int[] _qualities = [82, 65, 45];

    public static AvatarResult Process(ReadOnlySpan<byte> upload)
    {
        if (upload.IsEmpty)
        {
            return AvatarResult.Refused(AvatarRejection.Empty);
        }

        if (upload.Length > MaxUploadBytes)
        {
            return AvatarResult.Refused(AvatarRejection.TooLarge);
        }

        using var data = SKData.CreateCopy(upload);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.EncodedFormat is not (SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png or SKEncodedImageFormat.Webp))
        {
            return AvatarResult.Refused(AvatarRejection.Unsupported);
        }

        if (codec.FrameCount > 1)
        {
            return AvatarResult.Refused(AvatarRejection.Animated);
        }

        var width = codec.Info.Width;
        var height = codec.Info.Height;
        if (width <= 0 || height <= 0)
        {
            return AvatarResult.Refused(AvatarRejection.Damaged);
        }

        if (width > MaxSourceSide || height > MaxSourceSide || (long)width * height > MaxSourcePixels)
        {
            return AvatarResult.Refused(AvatarRejection.TooManyPixels);
        }

        // Decode only as much as the square needs: JPEG can decode at 1/2, 1/4 or 1/8 scale; other formats decode in full.
        var scale = Math.Min(1f, (float)(OutputSide * 2) / Math.Min(width, height));
        var decoded = codec.GetScaledDimensions(scale);
        if (decoded.Width <= 0 || decoded.Height <= 0 || (long)decoded.Width * decoded.Height > MaxDecodedPixels)
        {
            return AvatarResult.Refused(AvatarRejection.TooManyPixels);
        }

        var info = new SKImageInfo(decoded.Width, decoded.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var bitmap = new SKBitmap(info);
        if (codec.GetPixels(info, bitmap.GetPixels()) != SKCodecResult.Success)
        {
            return AvatarResult.Refused(AvatarRejection.Damaged);
        }

        bitmap.SetImmutable();

        // The centred square is the same region whichever way the camera was held, so crop first, then turn it upright.
        var side = Math.Min(decoded.Width, decoded.Height);
        var source = SKRect.Create((decoded.Width - side) / 2, (decoded.Height - side) / 2, side, side);
        var output = Math.Min(side, OutputSide);

        using var surface = SKSurface.Create(new SKImageInfo(output, output, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (surface is null)
        {
            return AvatarResult.Refused(AvatarRejection.Damaged);
        }

        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.SetMatrix(Upright(codec.EncodedOrigin, output));
        using (var image = SKImage.FromBitmap(bitmap))
        {
            canvas.DrawImage(image, source, SKRect.Create(output, output), new SKSamplingOptions(SKCubicResampler.Mitchell));
        }

        canvas.Flush();
        using var square = surface.Snapshot();
        foreach (var quality in _qualities)
        {
            using var encoded = square.Encode(SKEncodedImageFormat.Webp, quality);
            if (encoded is not null && encoded.Size <= MaxStoredBytes)
            {
                return new AvatarResult(encoded.ToArray(), output, null);
            }
        }

        return AvatarResult.Refused(AvatarRejection.TooLarge);
    }

    /// <summary>Maps the stored pixels of an <paramref name="side"/>-pixel square to how the camera meant them to be seen.</summary>
    internal static SKMatrix Upright(SKEncodedOrigin origin, int side)
    {
        float s = side;
        return origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, s, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, s, 0, -1, s, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, s, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, s, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, s, -1, 0, s, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, s, 0, 0, 1),
            _ => SKMatrix.Identity,
        };
    }
}
