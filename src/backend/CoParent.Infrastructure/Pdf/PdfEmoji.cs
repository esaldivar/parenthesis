using System.Globalization;
using System.Text;
using SkiaSharp;
using SkiaSharp.HarfBuzz;

namespace CoParent.Infrastructure.Pdf;

/// <summary>Measures and draws monochrome emoji using the same grapheme boundaries during wrapping and rendering.</summary>
internal sealed class PdfEmoji(float size) : IDisposable
{
    private readonly SKFont _font = PdfLayout.Font(PdfLayout.Emoji, size);
    private SKShaper? _shaper;

    public float Measure(ReadOnlySpan<char> element, SKFont regular) =>
        IsEmoji(element) ? Shape(element).Width : regular.MeasureText(element);

    public void Draw(SKCanvas canvas, string text, float x, float y, SKFont regular, SKPaint paint)
    {
        var remaining = text.AsSpan();
        var runStart = 0;
        for (var i = 0; i < remaining.Length;)
        {
            var length = StringInfo.GetNextTextElementLength(remaining[i..]);
            var element = remaining.Slice(i, length);
            if (IsEmoji(element))
            {
                x = DrawPlain(canvas, remaining[runStart..i], x, y, regular, paint);
                if (Rune.DecodeFromUtf16(element, out _, out var consumed) == System.Buffers.OperationStatus.Done &&
                    consumed == length)
                {
                    // Native text runs keep a single emoji searchable and copyable in the PDF.
                    x = DrawPlain(canvas, element, x, y, _font, paint);
                }
                else
                {
                    var result = Shape(element);
                    var glyphs = Array.ConvertAll(result.Codepoints, codepoint => (ushort)codepoint);
                    using var builder = new SKTextBlobBuilder();
                    builder.AddPositionedRun(glyphs, _font, result.Points);
                    using var blob = builder.Build();
                    canvas.DrawText(blob, x, y, paint);
                    x += result.Width;
                }

                runStart = i + length;
            }

            i += length;
        }

        DrawPlain(canvas, remaining[runStart..], x, y, regular, paint);
    }

    private SKShaper.Result Shape(ReadOnlySpan<char> element)
    {
        _shaper ??= new SKShaper(PdfLayout.Emoji);
        return _shaper.Shape(element.ToString(), _font);
    }

    private bool IsEmoji(ReadOnlySpan<char> element)
    {
        if (Rune.DecodeFromUtf16(element, out var first, out _) != System.Buffers.OperationStatus.Done)
        {
            return false;
        }

        // Preserve plain digits and punctuation. Keycaps start with one of those characters.
        return element.Contains('\u20e3') || (first.Value >= 0x2000 && _font.GetGlyph(first.Value) != 0);
    }

    private static float DrawPlain(SKCanvas canvas, ReadOnlySpan<char> text, float x, float y, SKFont font, SKPaint paint)
    {
        if (!text.IsEmpty)
        {
            canvas.DrawText(text.ToString(), x, y, SKTextAlign.Left, font, paint);
            x += font.MeasureText(text);
        }

        return x;
    }

    public void Dispose()
    {
        _shaper?.Dispose();
        _font.Dispose();
    }
}
