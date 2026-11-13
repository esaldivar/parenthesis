using CoParent.Infrastructure.Pdf;
using CoParent.Modules.Families.Endpoints;
using SkiaSharp;

namespace CoParent.Modules.Families.Infrastructure.Pdf;

/// <summary>One child's part of the PDF. <c>Discontinued</c> is null when the parent chose current medications only.</summary>
internal sealed record MedicationPdfSection(
    string ChildName, IReadOnlyList<MedicationEntry> Current, IReadOnlyList<MedicationEntry>? Discontinued);

/// <summary>
/// The printable medication reference (#127, docs/design/child-essentials-handoff.md): dated when made, one section per
/// child, current entries first and discontinued ones below their own heading. What parents recorded, nothing more.
/// </summary>
internal static class MedicationPdf
{
    private static readonly SKColor _ink = new(0x1F, 0x2A, 0x26);

    public static byte[] Render(IReadOnlyList<MedicationPdfSection> children, DateTimeOffset generatedAt, string date, bool spanish = false)
    {
        ArgumentNullException.ThrowIfNull(children);
        var title = spanish ? "Referencia de medicamentos infantiles" : "Child medication reference";
        var generated = spanish ? $"Generado el {date} (UTC)" : $"Generated {date} (UTC)";
        var note = spanish
            ? "Información ingresada por los padres. No es un consejo médico."
            : "Information entered by parents. Not medical advice.";
        var blocks = new List<IReadOnlyList<PdfLine>>
        {
            PdfLayout.Wrap(title, PdfLayout.Bold, 18, _ink, 0, 4)
                .Concat(PdfLayout.Wrap(generated, PdfLayout.Regular, 10, _ink, 0, 2))
                .Concat(PdfLayout.Wrap(note, PdfLayout.Regular, 10, _ink, 0, 16)).ToList(),
        };
        foreach (var child in children)
        {
            blocks.Add(PdfLayout.Wrap(child.ChildName, PdfLayout.Bold, 13, _ink, 0, 6)
                .Concat(PdfLayout.Wrap(spanish ? "Medicamentos actuales" : "Current medications", PdfLayout.Bold, 11, _ink, 0, 4))
                .ToList());
            AddEntries(blocks, child.Current, spanish ? "No hay medicamentos actuales" : "No current medications", spanish);
            if (child.Discontinued is { } discontinued)
            {
                blocks.Add(PdfLayout.Wrap(spanish ? "Medicamentos suspendidos" : "Discontinued medications", PdfLayout.Bold, 11, _ink, 0, 4));
                AddEntries(blocks, discontinued, spanish ? "No hay medicamentos suspendidos" : "No discontinued medications", spanish);
            }
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

    private static void AddEntries(List<IReadOnlyList<PdfLine>> blocks, IReadOnlyList<MedicationEntry> entries, string empty, bool spanish)
    {
        if (entries.Count == 0)
        {
            blocks.Add(PdfLayout.Wrap(empty, PdfLayout.Regular, 11, _ink, 12, 10));
            return;
        }

        foreach (var entry in entries)
        {
            var parts = new List<(string Text, SKTypeface Face)> { (entry.Name, PdfLayout.Bold) };
            foreach (var (label, value) in new[]
                     {
                         (spanish ? "Dosis recetada" : "Prescribed dose", entry.Dose),
                         (spanish ? "Horario" : "Schedule", entry.Schedule),
                         (spanish ? "Instrucciones" : "Instructions", entry.Instructions),
                     })
            {
                if (value is not null)
                {
                    parts.Add(($"{label}: {value}", PdfLayout.Regular));
                }
            }

            blocks.Add(parts.SelectMany((part, i) =>
                PdfLayout.Wrap(part.Text, part.Face, 11, _ink, 12, i == parts.Count - 1 ? 10 : 2)).ToList());
        }
    }
}
