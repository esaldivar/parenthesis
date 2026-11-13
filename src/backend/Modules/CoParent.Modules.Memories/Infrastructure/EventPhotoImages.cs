using SkiaSharp;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>Why an upload wasn't usable as an event photo. The app shows a matching message.</summary>
internal enum PhotoRejection
{
    Empty,
    TooLarge,
    Unsupported,
    Heic,
    Raw,
    Animated,
    TooManyPixels,
    Damaged,
    ProcessedTooLarge,
}

/// <summary>A processed photo and its thumbnail, or why the upload was refused.</summary>
internal sealed record ProcessedPhoto(byte[] Photo, byte[] Thumbnail, int Width, int Height, PhotoRejection? Rejection)
{
    public static ProcessedPhoto Refused(PhotoRejection rejection) => new([], [], 0, 0, rejection);
}

/// <summary>
/// Event photo processing (#403; docs/design/handoffs/EVENT_PHOTOS_403.md).
/// <list type="bullet">
/// <item>Source files up to 20 MB. Only JPEG, PNG and still WebP are accepted, decided from the file's own bytes.
/// HEIC/HEIF and RAW (DNG, which is TIFF-based) get their own messages so a parent knows what to do instead.</item>
/// <item>Dimensions are checked from the header before decoding; large JPEGs decode at a reduced scale.</item>
/// <item>The photo is turned upright, resized so its long side is at most <see cref="MaxLongSide"/> pixels (never
/// enlarged) and re-encoded as WebP at no more than 5 MB. A <see cref="ThumbnailLongSide"/>-pixel thumbnail is made
/// too. Re-encoding keeps pixels only: EXIF, GPS location and other embedded data are dropped.</item>
/// </list>
/// </summary>
internal static class EventPhotoImages
{
    public const int MaxSourceBytes = 20 * 1000 * 1000;

    public const int MaxStoredBytes = 5 * 1000 * 1000;

    public const int MaxLongSide = 2560;

    public const int ThumbnailLongSide = 480;

    /// <summary>The longest side a source image may claim.</summary>
    public const int MaxSourceSide = 16_000;

    /// <summary>The most pixels a source image may claim (a 48-megapixel phone photo fits; 200 MP doesn't).</summary>
    public const long MaxSourcePixels = 100_000_000;

    /// <summary>The most pixels actually decoded into memory, after any scaled JPEG decode.</summary>
    public const long MaxDecodedPixels = 26_000_000;

    public const string ContentType = "image/webp";

    private static readonly int[] _qualities = [85, 75, 60, 45];

    public static ProcessedPhoto Process(ReadOnlySpan<byte> upload)
    {
        if (upload.IsEmpty)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Empty);
        }

        if (upload.Length > MaxSourceBytes)
        {
            return ProcessedPhoto.Refused(PhotoRejection.TooLarge);
        }

        if (IsHeif(upload))
        {
            return ProcessedPhoto.Refused(PhotoRejection.Heic);
        }

        if (IsTiff(upload))
        {
            return ProcessedPhoto.Refused(PhotoRejection.Raw);
        }

        using var data = SKData.CreateCopy(upload);
        using var codec = SKCodec.Create(data);
        if (codec is null)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Unsupported);
        }

        if (codec.EncodedFormat is SKEncodedImageFormat.Dng)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Raw);
        }

        if (codec.EncodedFormat is SKEncodedImageFormat.Heif or SKEncodedImageFormat.Avif)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Heic);
        }

        if (codec.EncodedFormat is not (SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png or SKEncodedImageFormat.Webp))
        {
            return ProcessedPhoto.Refused(PhotoRejection.Unsupported);
        }

        if (codec.FrameCount > 1)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Animated);
        }

        return Render(codec);
    }

    private static ProcessedPhoto Render(SKCodec codec)
    {
        var width = codec.Info.Width;
        var height = codec.Info.Height;
        if (width <= 0 || height <= 0)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Damaged);
        }

        if (width > MaxSourceSide || height > MaxSourceSide || (long)width * height > MaxSourcePixels)
        {
            return ProcessedPhoto.Refused(PhotoRejection.TooManyPixels);
        }

        // JPEG can decode at 1/2, 1/4 or 1/8 scale: ask for the smallest that still covers the output size.
        var scale = Math.Min(1f, (float)MaxLongSide / Math.Max(width, height));
        var decoded = codec.GetScaledDimensions(scale);
        if (decoded.Width <= 0 || decoded.Height <= 0 || (long)decoded.Width * decoded.Height > MaxDecodedPixels)
        {
            return ProcessedPhoto.Refused(PhotoRejection.TooManyPixels);
        }

        var info = new SKImageInfo(decoded.Width, decoded.Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var bitmap = new SKBitmap(info);
        if (codec.GetPixels(info, bitmap.GetPixels()) != SKCodecResult.Success)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Damaged);
        }

        bitmap.SetImmutable();
        using var source = SKImage.FromBitmap(bitmap);

        var (photoWidth, photoHeight) = Fit(UprightSize(codec.EncodedOrigin, decoded.Width, decoded.Height), MaxLongSide);
        using var photo = Draw(source, codec.EncodedOrigin, photoWidth, photoHeight);
        if (photo is null)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Damaged);
        }

        var photoBytes = Encode(photo, _qualities, MaxStoredBytes);
        if (photoBytes is null)
        {
            return ProcessedPhoto.Refused(PhotoRejection.ProcessedTooLarge);
        }

        var (thumbWidth, thumbHeight) = Fit((photoWidth, photoHeight), ThumbnailLongSide);
        using var thumbnail = Draw(photo, SKEncodedOrigin.TopLeft, thumbWidth, thumbHeight);
        var thumbnailBytes = thumbnail is null ? null : Encode(thumbnail, [70, 50], MaxStoredBytes);
        if (thumbnailBytes is null)
        {
            return ProcessedPhoto.Refused(PhotoRejection.Damaged);
        }

        return new ProcessedPhoto(photoBytes, thumbnailBytes, photoWidth, photoHeight, null);
    }

    /// <summary>The size scaled down (never up) so its long side is at most <paramref name="longSide"/>.</summary>
    internal static (int Width, int Height) Fit((int Width, int Height) size, int longSide)
    {
        var longest = Math.Max(size.Width, size.Height);
        if (longest <= longSide)
        {
            return size;
        }

        var ratio = (double)longSide / longest;
        return (Math.Max(1, (int)Math.Round(size.Width * ratio)), Math.Max(1, (int)Math.Round(size.Height * ratio)));
    }

    /// <summary>The size as the camera meant it to be seen: rotated a quarter turn swaps width and height.</summary>
    private static (int Width, int Height) UprightSize(SKEncodedOrigin origin, int width, int height) =>
        origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom
            ? (height, width)
            : (width, height);

    private static SKImage? Draw(SKImage source, SKEncodedOrigin origin, int width, int height)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (surface is null)
        {
            return null;
        }

        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.SetMatrix(Upright(origin, width, height));
        var (drawWidth, drawHeight) = UprightSize(origin, width, height);
        canvas.DrawImage(source, SKRect.Create(drawWidth, drawHeight), new SKSamplingOptions(SKCubicResampler.Mitchell));
        canvas.Flush();
        return surface.Snapshot();
    }

    /// <summary>
    /// Maps the stored pixels, drawn at their own orientation into the output's (width, height), to how the camera meant
    /// them to be seen. For quarter turns the pixels are drawn with width and height swapped.
    /// </summary>
    internal static SKMatrix Upright(SKEncodedOrigin origin, int width, int height)
    {
        float w = width;
        float h = height;
        return origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, w, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, w, -1, 0, h, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, h, 0, 0, 1),
            _ => SKMatrix.Identity,
        };
    }

    private static byte[]? Encode(SKImage image, IEnumerable<int> qualities, int maxBytes)
    {
        foreach (var quality in qualities)
        {
            using var encoded = image.Encode(SKEncodedImageFormat.Webp, quality);
            if (encoded is not null && encoded.Size <= maxBytes)
            {
                return encoded.ToArray();
            }
        }

        return null;
    }

    /// <summary>ISO base media files whose brand is HEIF or HEIC (iPhone photos), or AVIF.</summary>
    private static bool IsHeif(ReadOnlySpan<byte> file)
    {
        if (file.Length < 12 || !file.Slice(4, 4).SequenceEqual("ftyp"u8))
        {
            return false;
        }

        var brand = file.Slice(8, 4);
        return brand.SequenceEqual("heic"u8) || brand.SequenceEqual("heix"u8) || brand.SequenceEqual("hevc"u8)
            || brand.SequenceEqual("hevx"u8) || brand.SequenceEqual("heim"u8) || brand.SequenceEqual("heis"u8)
            || brand.SequenceEqual("mif1"u8) || brand.SequenceEqual("msf1"u8) || brand.SequenceEqual("avif"u8);
    }

    /// <summary>TIFF headers: DNG and most other RAW formats (ProRAW is DNG).</summary>
    private static bool IsTiff(ReadOnlySpan<byte> file) =>
        file.Length >= 4 && (file[..4].SequenceEqual("II*\0"u8) || file[..4].SequenceEqual("MM\0*"u8));
}
