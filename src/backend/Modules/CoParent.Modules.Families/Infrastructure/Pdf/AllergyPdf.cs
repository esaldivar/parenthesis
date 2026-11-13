using CoParent.Infrastructure.Pdf;
using SkiaSharp;

namespace CoParent.Modules.Families.Infrastructure.Pdf;

internal sealed record AllergyPdfSection(string ChildName, string AllergySummary);

/// <summary>The printable allergy reference: one section per child, dated when it was made (layout in <see cref="PdfLayout"/>).</summary>
internal static class AllergyPdf
{
    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);

    public static byte[] Render(IReadOnlyList<AllergyPdfSection> children, DateTimeOffset generatedAt, string date, bool spanish = false)
    {
        ArgumentNullException.ThrowIfNull(children);
        var title = spanish ? "Referencia de alergias infantiles" : "Child allergy reference";
        var generated = spanish ? $"Generado el {date} (UTC)" : $"Generated {date} (UTC)";
        var blocks = new List<IReadOnlyList<PdfLine>>
        {
            PdfLayout.Wrap(title, PdfLayout.Bold, 18, _ink, 0, 4)
                .Concat(PdfLayout.Wrap(generated, PdfLayout.Regular, 10, _ink, 0, 16)).ToList(),
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
            Title = title,
            Creator = "Parenthesis",
            Creation = generatedAt.UtcDateTime,
        });
        for (var page = 0; page < pages.Count; page++)
        {
            var canvas = pdf.BeginPage(PdfLayout.PageWidth, PdfLayout.PageHeight);
            PdfLayout.Draw(canvas, pages[page], _ink);
            PdfLayout.Footer(canvas, spanish ? $"Página {page + 1} de {pages.Count}" : $"Page {page + 1} of {pages.Count}", _ink);
            pdf.EndPage();
        }

        pdf.Close();
        return stream.ToArray();
    }
}
