using SkiaSharp;

namespace CoParent.Modules.Messaging.Transcripts;

/// <summary>
/// Renders a <see cref="TranscriptDocument"/> as a US Letter PDF with SkiaSharp and embedded Noto Sans (the API image has
/// no system fonts). Text is real PDF text, so it can be searched and copied. A message's sender line is never left at
/// the foot of a page without its text, and every page carries the file name and "Page n of N".
/// </summary>
internal static class TranscriptPdf
{
    private const float PageWidth = 612;
    private const float PageHeight = 792;
    private const float Margin = 54;
    private const float FooterSpace = 30;
    private const float ContentWidth = PageWidth - (2 * Margin);
    private const float MessageIndent = 12;

    private static readonly Lazy<SKTypeface> _regular = new(() => Load("NotoSans-Regular.ttf"));
    private static readonly Lazy<SKTypeface> _bold = new(() => Load("NotoSans-Bold.ttf"));

    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);
    private static readonly SKColor _muted = new(0x55, 0x60, 0x5B);
    private static readonly SKColor _rule = new(0xC9, 0xD2, 0xCC);

    /// <summary>One laid-out line: what to draw and how far it moves down the page.</summary>
    private sealed record Line(string Text, SKTypeface Face, float Size, SKColor Color, float Indent, float Height, bool RuleBelow = false);

    public static byte[] Render(TranscriptDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        var pages = Paginate(Layout(document));

        using var stream = new MemoryStream();
        var metadata = new SKDocumentPdfMetadata
        {
            Title = document.Title,
            Subject = document.RangeLabel,
            Creator = "Parenthesis",
            Producer = "Parenthesis",
            Creation = document.PreparedAt.UtcDateTime,
            Modified = document.PreparedAt.UtcDateTime,
        };
        using (var pdf = SKDocument.CreatePdf(stream, metadata))
        {
            for (var i = 0; i < pages.Count; i++)
            {
                var canvas = pdf.BeginPage(PageWidth, PageHeight);
                Draw(canvas, pages[i]);
                using (var footerFont = NewFont(_regular.Value, 8))
                using (var paint = new SKPaint { Color = _muted, IsAntialias = true })
                {
                    canvas.DrawText($"{document.FileName} · Page {i + 1} of {pages.Count}", Margin, PageHeight - (Margin / 2), SKTextAlign.Left, footerFont, paint);
                }

                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    /// <summary>The document as blocks of lines; a block (a heading, or one message) stays together where it fits.</summary>
    private static List<List<Line>> Layout(TranscriptDocument document)
    {
        var blocks = new List<List<Line>>
        {
            Wrap(document.Title, _bold.Value, 18, _ink, 0, 4)
                .Concat(Wrap(document.RangeLabel, _regular.Value, 12, _ink, 0, 2))
                .Concat(Wrap(document.PreparedLabel, _regular.Value, 9, _muted, 0, 0))
                .Concat(Wrap($"{document.MessageCount} {(document.MessageCount == 1 ? "message" : "messages")}", _regular.Value, 9, _muted, 0, 0))
                .ToList(),
        };
        blocks[0][^1] = blocks[0][^1] with { RuleBelow = true, Height = blocks[0][^1].Height + 10 };

        if (document.Days.Count == 0)
        {
            blocks.Add(Wrap("No messages.", _regular.Value, 10.5f, _muted, 0, 0));
        }

        foreach (var day in document.Days)
        {
            var heading = Wrap(day.Label, _bold.Value, 11, _ink, 0, 4);
            heading[0] = heading[0] with { Height = heading[0].Height + 6 };
            var first = true;
            foreach (var message in day.Messages)
            {
                var lines = new List<Line>();
                if (first)
                {
                    // A day's heading travels with its first message.
                    lines.AddRange(heading);
                    first = false;
                }

                lines.AddRange(Wrap($"{message.Time}  ·  {message.Sender}", _bold.Value, 9.5f, _muted, 0, 1));
                if (message.Text.Length > 0)
                {
                    lines.AddRange(Wrap(message.Text, _regular.Value, 10.5f, _ink, MessageIndent, 0));
                }

                if (message.Event is { } shared)
                {
                    lines.AddRange(Wrap(shared, _regular.Value, 9.5f, _muted, MessageIndent, 0));
                }

                lines[^1] = lines[^1] with { Height = lines[^1].Height + 8 };
                blocks.Add(lines);
            }
        }

        return blocks;
    }

    /// <summary>Fills pages with blocks, moving a block to the next page when it doesn't fit, and splitting one taller than a page.</summary>
    private static List<List<Line>> Paginate(List<List<Line>> blocks)
    {
        const float available = PageHeight - (2 * Margin) - FooterSpace;
        var pages = new List<List<Line>> { new() };
        var used = 0f;
        foreach (var block in blocks)
        {
            var height = block.Sum(l => l.Height);
            if (used > 0 && used + height > available && height <= available)
            {
                pages.Add([]);
                used = 0;
            }

            foreach (var line in block)
            {
                if (used > 0 && used + line.Height > available)
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

    private static void Draw(SKCanvas canvas, List<Line> lines)
    {
        var y = Margin;
        foreach (var line in lines)
        {
            using var font = NewFont(line.Face, line.Size);
            using var paint = new SKPaint { Color = line.Color, IsAntialias = true };
            // Baseline: the line's top plus its ascent.
            canvas.DrawText(line.Text, Margin + line.Indent, y - font.Metrics.Ascent, SKTextAlign.Left, font, paint);
            y += line.Height;
            if (line.RuleBelow)
            {
                using var rule = new SKPaint { Color = _rule, StrokeWidth = 0.75f, IsAntialias = true };
                canvas.DrawLine(Margin, y - 6, PageWidth - Margin, y - 6, rule);
            }
        }
    }

    /// <summary>Word-wraps text to the content width, keeping its line breaks and breaking words longer than a line.</summary>
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
        using var stream = typeof(TranscriptPdf).Assembly.GetManifestResourceStream($"Transcripts.Fonts.{file}")
            ?? throw new InvalidOperationException($"The transcript font {file} isn't embedded.");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        // Skia keeps reading the font while drawing, so it gets its own copy of the bytes.
        using var data = SKData.CreateCopy(copy.ToArray());
        return SKTypeface.FromData(data)
            ?? throw new InvalidOperationException($"The transcript font {file} couldn't be read.");
    }
}
