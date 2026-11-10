using System.Globalization;
using SkiaSharp;

namespace CoParent.Infrastructure.Pdf;

/// <summary>One laid-out line: what to draw, where, and how far it moves down the page.</summary>
public sealed record PdfLine(
    string Text, SKTypeface Face, float Size, SKColor Color, float Indent, float Height, bool RuleBelow = false, bool Emoji = false);

/// <summary>
/// The text layout every PDF the API makes shares (chat transcripts, the allergy reference): US Letter pages, embedded
/// Noto Sans (the API image has no system fonts), word wrapping, blocks kept together across pages, and drawing. Text
/// is real PDF text, so it can be searched and copied.
/// </summary>
public static class PdfLayout
{
    public const float PageWidth = 612;
    public const float PageHeight = 792;
    public const float Margin = 54;
    public const float FooterSpace = 30;
    public const float ContentWidth = PageWidth - (2 * Margin);

    private static readonly Lazy<SKTypeface> _regular = new(() => Load("NotoSans-Regular.ttf"));
    private static readonly Lazy<SKTypeface> _bold = new(() => Load("NotoSans-Bold.ttf"));

    private static readonly Lazy<SKTypeface> _serif = new(() => Load("TranscriptSerif.ttf"));
    private static readonly Lazy<SKTypeface> _emoji = new(() => Load("NotoEmoji-Regular.ttf"));

    public static SKTypeface Serif => _serif.Value;

    internal static SKTypeface Emoji => _emoji.Value;

    public static SKTypeface Regular => _regular.Value;

    public static SKTypeface Bold => _bold.Value;

    /// <summary>Unhinted, subpixel-positioned text: a PDF isn't a pixel grid, and hinting leaves uneven letter gaps.</summary>
    public static SKFont Font(SKTypeface face, float size) =>
        new(face, size) { Hinting = SKFontHinting.None, Subpixel = true, LinearMetrics = true };

    /// <summary>
    /// Word-wraps text to the content width, keeping its line breaks and breaking words longer than a line. The last
    /// line also moves the page down by <paramref name="spaceAfter"/>.
    /// </summary>
    public static List<PdfLine> Wrap(string text, SKTypeface face, float size, SKColor color, float indent, float spaceAfter,
        float? maxWidth = null, bool preserveText = false)
    {
        ArgumentNullException.ThrowIfNull(text);
        using var font = Font(face, size);
        var width = maxWidth ?? (ContentWidth - indent);
        var height = size * 1.4f;
        using var emoji = preserveText ? new PdfEmoji(size) : null;
        var lines = new List<string>();
        foreach (var paragraph in text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (emoji is not null)
            {
                WrapParagraph(paragraph, font, emoji, width, lines);
                continue;
            }

            var current = "";
            foreach (var word in paragraph.Split(' '))
            {
                var candidate = current.Length == 0 ? word : $"{current} {word}";
                if (font.MeasureText(candidate) <= width)
                {
                    current = candidate;
                    continue;
                }

                if (current.Length > 0)
                {
                    lines.Add(current);
                }

                current = word;
                while (current.Length > 1 && font.MeasureText(current) > width)
                {
                    var fits = Math.Max(1, (int)font.BreakText(current, width));
                    lines.Add(current[..fits]);
                    current = current[fits..];
                }
            }

            lines.Add(current);
        }

        var result = lines.Select(l => new PdfLine(l, face, size, color, indent, height, Emoji: preserveText)).ToList();
        result[^1] = result[^1] with { Height = height + spaceAfter };
        return result;
    }

    // Break at a space when possible, or a grapheme boundary for long unbroken text. Preserve spaces and empty lines.
    private static void WrapParagraph(string paragraph, SKFont font, PdfEmoji emoji, float width, List<string> lines)
    {
        var remaining = paragraph.AsSpan();
        while (!remaining.IsEmpty)
        {
            var boundary = 0;
            var space = 0;
            var measured = 0f;
            while (boundary < remaining.Length)
            {
                var length = StringInfo.GetNextTextElementLength(remaining[boundary..]);
                measured += emoji.Measure(remaining.Slice(boundary, length), font);
                if (measured > width && boundary > 0)
                {
                    break;
                }

                if (remaining[boundary] == ' ')
                {
                    space = boundary + length;
                }

                boundary += length;
            }

            var end = boundary < remaining.Length && space > 0 ? space : boundary;
            lines.Add(remaining[..end].ToString());
            remaining = remaining[end..];
        }

        if (paragraph.Length == 0)
        {
            lines.Add("");
        }
    }

    /// <summary>
    /// Fills pages with blocks, moving a block to the next page when it doesn't fit there and splitting one taller than a
    /// page.
    /// </summary>
    public static List<List<PdfLine>> Paginate(IEnumerable<IReadOnlyList<PdfLine>> blocks)
    {
        ArgumentNullException.ThrowIfNull(blocks);
        const float available = PageHeight - (2 * Margin) - FooterSpace;
        // Adding up fractional line heights must not split a block that fits exactly, or leave a blank last page.
        const float tolerance = 0.01f;
        var pages = new List<List<PdfLine>> { new() };
        var used = 0f;
        foreach (var block in blocks)
        {
            var height = block.Sum(l => l.Height);
            if (used > 0 && used + height > available + tolerance && height <= available + tolerance)
            {
                pages.Add([]);
                used = 0;
            }

            foreach (var line in block)
            {
                if (used > 0 && used + line.Height > available + tolerance)
                {
                    pages.Add([]);
                    used = 0;
                }

                pages[^1].Add(line);
                used += line.Height;
            }
        }

        return pages;
    }

    /// <summary>Draws a page's lines from the top margin, with a thin rule under any line that asks for one.</summary>
    public static void Draw(SKCanvas canvas, IEnumerable<PdfLine> lines, SKColor rule, float top = Margin)
    {
        ArgumentNullException.ThrowIfNull(canvas);
        ArgumentNullException.ThrowIfNull(lines);
        var y = top;
        foreach (var line in lines)
        {
            using var font = Font(line.Face, line.Size);
            using var paint = new SKPaint { Color = line.Color, IsAntialias = true };
            // Baseline: the line's top plus its ascent.
            var baseline = y - font.Metrics.Ascent;
            if (line.Emoji)
            {
                using var emoji = new PdfEmoji(line.Size);
                emoji.Draw(canvas, line.Text, Margin + line.Indent, baseline, font, paint);
            }
            else
            {
                canvas.DrawText(line.Text, Margin + line.Indent, baseline, SKTextAlign.Left, font, paint);
            }

            y += line.Height;
            if (line.RuleBelow)
            {
                using var stroke = new SKPaint { Color = rule, StrokeWidth = 0.75f, IsAntialias = true };
                canvas.DrawLine(Margin, y - 6, PageWidth - Margin, y - 6, stroke);
            }
        }
    }

    /// <summary>Writes the page footer (small text near the bottom left).</summary>
    public static void Footer(SKCanvas canvas, string text, SKColor color)
    {
        ArgumentNullException.ThrowIfNull(canvas);
        using var font = Font(Regular, 8);
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        canvas.DrawText(text, Margin, PageHeight - (Margin / 2), SKTextAlign.Left, font, paint);
    }

    private static SKTypeface Load(string file)
    {
        using var stream = typeof(PdfLayout).Assembly.GetManifestResourceStream($"CoParent.Infrastructure.Pdf.Fonts.{file}")
            ?? throw new InvalidOperationException($"The PDF font {file} isn't embedded.");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        // Skia keeps reading the font while drawing, so it gets its own copy of the bytes.
        using var data = SKData.CreateCopy(copy.ToArray());
        return SKTypeface.FromData(data)
            ?? throw new InvalidOperationException($"The PDF font {file} couldn't be read.");
    }
}
