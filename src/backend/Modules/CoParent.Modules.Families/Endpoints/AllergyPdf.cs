using SkiaSharp;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record AllergyPdfSection(string ChildName, string AllergySummary);

internal static class AllergyPdf
{
    private const float PageWidth = 612;
    private const float PageHeight = 792;
    private const float Margin = 54;
    private const float FooterSpace = 30;
    private const float ContentWidth = PageWidth - (2 * Margin);
    private static readonly Lazy<SKTypeface> _regular = new(() => Load("NotoSans-Regular.ttf"));
    private static readonly Lazy<SKTypeface> _bold = new(() => Load("NotoSans-Bold.ttf"));
    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);

    private sealed record Line(string Text, SKTypeface Face, float Size, SKColor Color, float Indent, float Height);

    public static byte[] Render(IReadOnlyList<AllergyPdfSection> children, DateTimeOffset generatedAt, string date)
    {
        var blocks = new List<List<Line>>
        {
            Wrap("Child allergy reference", _bold.Value, 18, _ink, 0, 4)
                .Concat(Wrap($"Generated {date} (UTC)", _regular.Value, 10, _ink, 0, 16)).ToList(),
        };
        foreach (var child in children)
        {
            blocks.Add(Wrap(child.ChildName, _bold.Value, 13, _ink, 0, 3)
                .Concat(Wrap(child.AllergySummary, _regular.Value, 11, _ink, 0, 12)).ToList());
        }

        var pages = Paginate(blocks);
        using var stream = new MemoryStream();
        using var pdf = SKDocument.CreatePdf(stream, new SKDocumentPdfMetadata
        {
            Title = "Child allergy reference",
            Creator = "Parenthesis",
            Creation = generatedAt.UtcDateTime,
        });
        using var paint = new SKPaint { Color = _ink, IsAntialias = true };
        for (var page = 0; page < pages.Count; page++)
        {
            var canvas = pdf.BeginPage(PageWidth, PageHeight);
            var y = Margin;
            foreach (var line in pages[page])
            {
                using var font = NewFont(line.Face, line.Size);
                canvas.DrawText(line.Text, Margin + line.Indent, y - font.Metrics.Ascent, SKTextAlign.Left, font, paint);
                y += line.Height;
            }

            using var footer = NewFont(_regular.Value, 8);
            canvas.DrawText($"Page {page + 1} of {pages.Count}", Margin, PageHeight - (Margin / 2), SKTextAlign.Left, footer, paint);
            pdf.EndPage();
        }

        pdf.Close();
        return stream.ToArray();
    }

    private static List<List<Line>> Paginate(List<List<Line>> blocks)
    {
        const float available = PageHeight - (2 * Margin) - FooterSpace;
        // Accumulating fractional line heights must not split a block that fits exactly.
        const float tolerance = 0.01f;
        var pages = new List<List<Line>> { new() };
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

    private static List<Line> Wrap(string text, SKTypeface face, float size, SKColor color, float indent, float spaceAfter)
    {
        using var font = NewFont(face, size);
        var width = ContentWidth - indent;
        var height = size * 1.4f;
        var lines = new List<string>();
        foreach (var paragraph in text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
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

        var result = lines.Select(l => new Line(l, face, size, color, indent, height)).ToList();
        result[^1] = result[^1] with { Height = height + spaceAfter };
        return result;
    }

    /// <summary>Unhinted, subpixel-positioned text: a PDF isn't a pixel grid, and hinting leaves uneven letter gaps.</summary>
    private static SKFont NewFont(SKTypeface face, float size) =>
        new(face, size) { Hinting = SKFontHinting.None, Subpixel = true, LinearMetrics = true };

    private static SKTypeface Load(string file)
    {
        using var stream = typeof(AllergyPdf).Assembly.GetManifestResourceStream($"AllergyPdf.Fonts.{file}")
            ?? throw new InvalidOperationException($"The PDF font {file} isn't embedded.");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        // Skia keeps reading the font while drawing, so it gets its own copy of the bytes.
        using var data = SKData.CreateCopy(copy.ToArray());
        return SKTypeface.FromData(data)
            ?? throw new InvalidOperationException($"The PDF font {file} couldn't be read.");
    }
}
