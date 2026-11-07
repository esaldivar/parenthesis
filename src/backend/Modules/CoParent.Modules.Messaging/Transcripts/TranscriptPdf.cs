using CoParent.Infrastructure.Pdf;
using SkiaSharp;

namespace CoParent.Modules.Messaging.Transcripts;

/// <summary>
/// Renders a <see cref="TranscriptDocument"/> as a US Letter PDF (layout and fonts in <see cref="PdfLayout"/>). A
/// message's sender line is never left at the foot of a page without its text, and every page carries the file name and
/// "Page n of N".
/// </summary>
internal static class TranscriptPdf
{
    private const float MessageIndent = 12;

    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);
    private static readonly SKColor _muted = new(0x55, 0x60, 0x5B);
    private static readonly SKColor _rule = new(0xC9, 0xD2, 0xCC);

    public static byte[] Render(TranscriptDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        var pages = PdfLayout.Paginate(Layout(document));

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
                PdfLayout.Draw(canvas, pages[i], _rule);
                PdfLayout.Footer(canvas, $"{document.FileName} · Page {i + 1} of {pages.Count}", _muted);
                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    /// <summary>The document as blocks of lines; a block (a heading, or one message) stays together where it fits.</summary>
    private static List<IReadOnlyList<PdfLine>> Layout(TranscriptDocument document)
    {
        var header = PdfLayout.Wrap(document.Title, PdfLayout.Bold, 18, _ink, 0, 4)
                .Concat(PdfLayout.Wrap(document.RangeLabel, PdfLayout.Regular, 12, _ink, 0, 2))
                .Concat(PdfLayout.Wrap(document.PreparedLabel, PdfLayout.Regular, 9, _muted, 0, 0))
                .Concat(PdfLayout.Wrap($"{document.MessageCount} {(document.MessageCount == 1 ? "message" : "messages")}", PdfLayout.Regular, 9, _muted, 0, 0))
                .ToList();
        header[^1] = header[^1] with { RuleBelow = true, Height = header[^1].Height + 10 };
        var blocks = new List<IReadOnlyList<PdfLine>> { header };

        if (document.Days.Count == 0)
        {
            blocks.Add(PdfLayout.Wrap("No messages.", PdfLayout.Regular, 10.5f, _muted, 0, 0));
        }

        foreach (var day in document.Days)
        {
            var heading = PdfLayout.Wrap(day.Label, PdfLayout.Bold, 11, _ink, 0, 4);
            heading[0] = heading[0] with { Height = heading[0].Height + 6 };
            var first = true;
            foreach (var message in day.Messages)
            {
                var lines = new List<PdfLine>();
                if (first)
                {
                    // A day's heading travels with its first message.
                    lines.AddRange(heading);
                    first = false;
                }

                lines.AddRange(PdfLayout.Wrap($"{message.Time}  ·  {message.Sender}", PdfLayout.Bold, 9.5f, _muted, 0, 1));
                if (message.Text.Length > 0)
                {
                    lines.AddRange(PdfLayout.Wrap(message.Text, PdfLayout.Regular, 10.5f, _ink, MessageIndent, 0));
                }

                if (message.Event is { } shared)
                {
                    lines.AddRange(PdfLayout.Wrap(shared, PdfLayout.Regular, 9.5f, _muted, MessageIndent, 0));
                }

                lines[^1] = lines[^1] with { Height = lines[^1].Height + 8 };
                blocks.Add(lines);
            }
        }

        return blocks;
    }
}
