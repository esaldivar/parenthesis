using CoParent.Infrastructure.Pdf;
using SkiaSharp;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record AllergyPdfSection(string ChildName, string AllergySummary);

/// <summary>The printable allergy reference: one section per child, dated when it was made (layout in <see cref="PdfLayout"/>).</summary>
internal static class AllergyPdf
{
    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);

    public static byte[] Render(IReadOnlyList<AllergyPdfSection> children, DateTimeOffset generatedAt, string date)
    {
        ArgumentNullException.ThrowIfNull(children);
        var blocks = new List<IReadOnlyList<PdfLine>>
        {
            PdfLayout.Wrap("Child allergy reference", PdfLayout.Bold, 18, _ink, 0, 4)
                .Concat(PdfLayout.Wrap($"Generated {date} (UTC)", PdfLayout.Regular, 10, _ink, 0, 16)).ToList(),
        };
        foreach (var child in children)
        {
            blocks.Add(PdfLayout.Wrap(child.ChildName, PdfLayout.Bold, 13, _ink, 0, 3)
                .Concat(PdfLayout.Wrap(child.AllergySummary, PdfLayout.Regular, 11, _ink, 0, 12)).ToList());
        }

        var pages = PdfLayout.Paginate(blocks);
        using var stream = new MemoryStream();
        using var pdf = SKDocument.CreatePdf(stream, new SKDocumentPdfMetadata
        {
            Title = "Child allergy reference",
            Creator = "Parenthesis",
            Creation = generatedAt.UtcDateTime,
        });
        for (var page = 0; page < pages.Count; page++)
        {
            var canvas = pdf.BeginPage(PdfLayout.PageWidth, PdfLayout.PageHeight);
            PdfLayout.Draw(canvas, pages[page], _ink);
            PdfLayout.Footer(canvas, $"Page {page + 1} of {pages.Count}", _ink);
            pdf.EndPage();
        }

        pdf.Close();
        return stream.ToArray();
    }
}
