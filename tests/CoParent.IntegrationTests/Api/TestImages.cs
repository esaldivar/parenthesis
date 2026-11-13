using System.Buffers.Binary;
using System.Text;
using SkiaSharp;

namespace CoParent.IntegrationTests.Api;

/// <summary>Generated test photos shared by the profile photo (#388) and event photo (#403) tests.</summary>
internal static class TestImages
{
    /// <summary>A JPEG whose left half is red and right half blue.</summary>
    public static byte[] HalvesJpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            using var red = new SKPaint { Color = SKColors.Red };
            using var blue = new SKPaint { Color = SKColors.Blue };
            canvas.DrawRect(0, 0, width / 2f, height, red);
            canvas.DrawRect(width / 2f, 0, width / 2f, height, blue);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    /// <summary>Inserts an EXIF block (orientation and a description) right after the JPEG's start marker.</summary>
    public static byte[] WithExif(byte[] jpeg, ushort orientation, string description)
    {
        var text = Encoding.ASCII.GetBytes(description + "\0");
        using var tiff = new MemoryStream();
        void U16(int v) { Span<byte> b = stackalloc byte[2]; BinaryPrimitives.WriteUInt16LittleEndian(b, (ushort)v); tiff.Write(b); }
        void U32(int v) { Span<byte> b = stackalloc byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(b, (uint)v); tiff.Write(b); }
        tiff.Write("II"u8);
        U16(42);
        U32(8);
        U16(2); // two entries
        U16(0x010E); U16(2); U32(text.Length); U32(8 + 2 + (2 * 12) + 4); // ImageDescription, ASCII, at the end
        U16(0x0112); U16(3); U32(1); U16(orientation); U16(0); // Orientation, SHORT
        U32(0); // no next IFD
        tiff.Write(text);

        var payload = "Exif\0\0"u8.ToArray().Concat(tiff.ToArray()).ToArray();
        var length = payload.Length + 2;
        byte[] app1 = [0xFF, 0xE1, (byte)(length >> 8), (byte)length, .. payload];
        return [.. jpeg[..2], .. app1, .. jpeg[2..]];
    }
}
