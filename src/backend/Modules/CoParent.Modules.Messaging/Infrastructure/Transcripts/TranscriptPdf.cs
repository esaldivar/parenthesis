using System.Xml.Linq;
using CoParent.Infrastructure.Pdf;
using SkiaSharp;

namespace CoParent.Modules.Messaging.Infrastructure.Transcripts;

/// <summary>US Letter rendering of the owner-approved transcript in #548.</summary>
internal static class TranscriptPdf
{
    private const float Bottom = PdfLayout.PageHeight - PdfLayout.Margin - PdfLayout.FooterSpace;
    private const float HalfWidth = PdfLayout.ContentWidth / 2;
    private const float MessageSpacing = 12;

    private static readonly SKColor _ink = new(34, 34, 34);
    private static readonly SKColor _muted = new(75, 75, 75);
    private static readonly SKColor _rule = new(171, 171, 171);
    private static readonly SKColor _panel = new(242, 242, 242);
    private static readonly Lazy<SKPicture> _brand = new(LoadBrand);

    public static byte[] Render(TranscriptDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        var pages = Paginate(document);

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
                var canvas = pdf.BeginPage(PdfLayout.PageWidth, PdfLayout.PageHeight);
                var page = pages[i];
                DrawHeader(canvas, page.Header, i == 0);
                PdfLayout.Draw(canvas, page.Lines, _rule, page.BodyTop);
                DrawFooter(canvas, document.Labels.Page(i + 1, pages.Count));
                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    private static List<Page> Paginate(TranscriptDocument document)
    {
        var page = new Page(document, first: true);
        var pages = new List<Page> { page };
        if (document.MessageCount == 0)
        {
            page.Add(PdfLayout.Wrap(document.Labels.NoMessages, PdfLayout.Regular, 10.5f, _muted, 0, 0));
        }

        foreach (var day in document.Days)
        {
            var heading = PdfLayout.Wrap(day.Label, PdfLayout.Bold, 12, _ink, 0, 9);
            heading[^1] = heading[^1] with { RuleBelow = true };
            var needsDate = true;
            foreach (var message in day.Messages)
            {
                var sender = Sender(message);
                var body = MessageBody(message);
                var height = Height(sender) + Height(body);
                var headingHeight = Height(heading);
                var required = height + (needsDate ? headingHeight : 0);
                if (required > page.Remaining)
                {
                    var next = new Page(document, first: false);
                    // Move a complete message to the next page where it fits. A long message starts on this
                    // page if there is room for its heading, sender and at least one content line.
                    if (height + headingHeight <= next.Remaining ||
                        page.Remaining < (needsDate ? headingHeight : 0) + Height(sender) + body[0].Height)
                    {
                        page = next;
                        pages.Add(page);
                        needsDate = true;
                    }
                }

                if (needsDate)
                {
                    page.Add(heading);
                    needsDate = false;
                }

                page.Add(sender);
                foreach (var line in body)
                {
                    // Spacing below a message must not push its final line onto a page of its own.
                    var lineHeight = line.RuleBelow ? line.Height - MessageSpacing : line.Height;
                    if (lineHeight > page.Remaining)
                    {
                        page = new Page(document, first: false);
                        pages.Add(page);
                        page.Add(heading);
                        page.Add(Sender(message with { Sender = $"{message.Sender} {document.Labels.Continued}" }));
                    }

                    page.Add([line]);
                }
            }
        }

        return pages;
    }

    private static List<PdfLine> Sender(TranscriptMessage message)
    {
        using var timeFont = PdfLayout.Font(PdfLayout.Regular, 8.5f);
        var timeWidth = timeFont.MeasureText(message.Time);
        var lines = PdfLayout.Wrap(message.Sender, PdfLayout.Bold, 11, _ink, 0, 2,
            PdfLayout.ContentWidth - timeWidth - 12);
        lines.Insert(0, new PdfLine(message.Time, PdfLayout.Regular, 8.5f, _muted,
            PdfLayout.ContentWidth - timeWidth, 0));
        return lines;
    }

    private static List<PdfLine> MessageBody(TranscriptMessage message)
    {
        var lines = new List<PdfLine>();
        if (message.Text.Length > 0)
        {
            lines.AddRange(PdfLayout.Wrap(message.Text, PdfLayout.Regular, 11, _ink, 0, 0, preserveText: true));
        }

        if (message.Event is { } shared)
        {
            lines.AddRange(PdfLayout.Wrap(shared, PdfLayout.Bold, 9, _muted, 0, 0));
        }

        if (lines.Count == 0)
        {
            lines.Add(new PdfLine("", PdfLayout.Regular, 11, _ink, 0, 15.4f));
        }

        lines[^1] = lines[^1] with { Height = lines[^1].Height + MessageSpacing, RuleBelow = true };
        return lines;
    }

    private static void DrawHeader(SKCanvas canvas, Header header, bool first)
    {
        const float top = PdfLayout.Margin;
        const float left = PdfLayout.Margin;
        if (first)
        {
            canvas.Save();
            canvas.Translate(left, top - 5);
            canvas.Scale(0.15f);
            canvas.DrawPicture(_brand.Value);
            canvas.Restore();
            DrawText(canvas, "P A R E N T H E S I S", left + 36, top + 13, PdfLayout.Bold, 10, _ink);
            Rule(canvas, top + 29, _ink);
            PdfLayout.Draw(canvas, header.Title, _rule, top + 40);
        }

        using var background = new SKPaint { Color = _panel };
        canvas.DrawRect(left, header.PanelTop, PdfLayout.ContentWidth, header.PanelHeight, background);
        var y = header.PanelTop + 8;
        foreach (var row in header.Rows)
        {
            PdfLayout.Draw(canvas, row.Left, _rule, y);
            PdfLayout.Draw(canvas, row.Right, _rule, y);
            y += row.Height + 7;
        }

        if (first)
        {
            DrawText(canvas, header.Count, PdfLayout.PageWidth - left, header.BodyTop - 12,
                PdfLayout.Bold, 9, _muted, SKTextAlign.Right);
        }
    }

    private static void DrawFooter(SKCanvas canvas, string page)
    {
        const float y = PdfLayout.PageHeight - PdfLayout.Margin;
        Rule(canvas, y, _ink);
        DrawText(canvas, "Parenthesis", PdfLayout.Margin, y + 15, PdfLayout.Regular, 8, _muted);
        DrawText(canvas, page, PdfLayout.PageWidth - PdfLayout.Margin, y + 15, PdfLayout.Bold, 9, _ink, SKTextAlign.Right);
    }

    private static void Rule(SKCanvas canvas, float y, SKColor color)
    {
        using var stroke = new SKPaint { Color = color, StrokeWidth = 0.65f, IsAntialias = true };
        canvas.DrawLine(PdfLayout.Margin, y, PdfLayout.PageWidth - PdfLayout.Margin, y, stroke);
    }

    private static void DrawText(SKCanvas canvas, string text, float x, float y, SKTypeface face, float size,
        SKColor color, SKTextAlign alignment = SKTextAlign.Left)
    {
        using var font = PdfLayout.Font(face, size);
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        canvas.DrawText(text, x, y, alignment, font, paint);
    }

    private static SKPicture LoadBrand()
    {
        using var source = typeof(TranscriptPdf).Assembly.GetManifestResourceStream("Parenthesis.TranscriptIcon.svg")
            ?? throw new InvalidOperationException("The transcript brand icon isn't embedded.");
        // This is the repository's fixed icon. Its paths use even-odd fills in a single translated group.
        var svg = XDocument.Load(source);
        using var recorder = new SKPictureRecorder();
        var canvas = recorder.BeginRecording(SKRect.Create(188, 174));
        canvas.Translate(19, 25);
        using var paint = new SKPaint { IsAntialias = true };
        foreach (var element in svg.Descendants(XName.Get("path", "http://www.w3.org/2000/svg")))
        {
            var color = SKColor.Parse((string?)element.Attribute("fill") ?? "#000000");
            var gray = (byte)((color.Red * 299 + color.Green * 587 + color.Blue * 114) / 1000);
            paint.Color = new SKColor(gray, gray, gray);
            using var path = SKPath.ParseSvgPathData((string?)element.Attribute("d") ?? "");
            path.FillType = SKPathFillType.EvenOdd;
            canvas.DrawPath(path, paint);
        }

        return recorder.EndRecording();
    }

    private static float Height(IEnumerable<PdfLine> lines) => lines.Sum(line => line.Height);

    private sealed record Row(IReadOnlyList<PdfLine> Left, IReadOnlyList<PdfLine> Right)
    {
        public float Height => Math.Max(TranscriptPdf.Height(Left), TranscriptPdf.Height(Right));

        public static List<PdfLine> Cell(string label, string value, float column)
        {
            var indent = column + 12;
            return PdfLayout.Wrap(label.ToUpperInvariant(), PdfLayout.Bold, 8.5f, _muted, indent, 1, HalfWidth - 24)
                .Concat(PdfLayout.Wrap(value, PdfLayout.Regular, 10, _ink, indent, 0, HalfWidth - 24))
                .ToList();
        }
    }

    private sealed class Header(TranscriptDocument document, bool first)
    {
        public IReadOnlyList<PdfLine> Title { get; } = first
            ? PdfLayout.Wrap(document.Title, PdfLayout.Serif, 28, _ink, 0, 2)
                .Concat(PdfLayout.Wrap(document.Labels.Description, PdfLayout.Regular, 10, _muted, 0, 0)).ToList()
            : [];

        public IReadOnlyList<Row> Rows { get; } = first
            ? [
                new(Row.Cell(document.Labels.Participants, document.Participants, 0),
                    Row.Cell(document.Labels.InclusiveRange, document.RangeLabel, HalfWidth)),
                new(Row.Cell(document.Labels.DisplayTimeZone, document.TimeZone, 0),
                    Row.Cell(document.Labels.Generated, document.PreparedLabel, HalfWidth)),
            ]
            : [
                new(Row.Cell(document.Labels.InclusiveRange, document.RangeLabel, 0),
                    Row.Cell(document.Labels.DisplayTimeZone, document.TimeZone, HalfWidth)),
            ];

        public float PanelTop => PdfLayout.Margin + (first ? 54 + Height(Title) : 0);
        public float PanelHeight => 9 + Rows.Sum(row => row.Height + 7);
        public float BodyTop => PanelTop + PanelHeight + (first ? 34 : 18);
        public string Count => document.Labels.Count(document.MessageCount);
    }

    private sealed class Page(TranscriptDocument document, bool first)
    {
        private float _used;
        public Header Header { get; } = new(document, first);
        public List<PdfLine> Lines { get; } = [];
        public float BodyTop => Header.BodyTop;
        public float Remaining => Bottom - BodyTop - _used;

        public void Add(IReadOnlyList<PdfLine> lines)
        {
            Lines.AddRange(lines);
            _used += Height(lines);
        }
    }
}
