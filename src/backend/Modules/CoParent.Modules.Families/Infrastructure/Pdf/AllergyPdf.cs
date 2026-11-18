using System.Globalization;
using CoParent.Infrastructure.Pdf;
using SkiaSharp;
using static CoParent.Modules.Families.Infrastructure.Pdf.BrandedPdf;

namespace CoParent.Modules.Families.Infrastructure.Pdf;

internal sealed record AllergyPdfSection(string ChildName, string AllergySummary);

/// <summary>
/// The printable allergy reference (#662), drawn to the approved Figma layout 332:2 on US Letter: the Parenthesis logo,
/// "Child allergy reference" and when it was generated, then for each child a soft band with their name, "Allergies and
/// notes" and what parents entered (or the explicit no-known / not-listed wording), a closing note, and a private
/// footer with the page number. Allergy notes only; long notes and several children run onto further pages, where the
/// child's band repeats.
/// </summary>
internal static class AllergyPdf
{
    /// <summary>The body stops above the footer rule.</summary>
    private const float Bottom = FooterRule - 12;

    /// <summary>Where a continuation page's content starts: the title's place on the first page.</summary>
    private const float ContinuedTop = 104;

    public static byte[] Render(IReadOnlyList<AllergyPdfSection> children, DateTimeOffset generatedAt, string date, bool spanish = false)
    {
        ArgumentNullException.ThrowIfNull(children);
        var labels = spanish ? Labels.Spanish : Labels.English;
        var pages = new Writer(labels, date).Write(children);

        using var stream = new MemoryStream();
        using (var pdf = SKDocument.CreatePdf(stream, new SKDocumentPdfMetadata
        {
            Title = labels.Title,
            Creator = "Parenthesis",
            Producer = "Parenthesis",
            Creation = generatedAt.UtcDateTime,
            Modified = generatedAt.UtcDateTime,
        }))
        {
            for (var i = 0; i < pages.Count; i++)
            {
                var canvas = pdf.BeginPage(PdfLayout.PageWidth, PdfLayout.PageHeight);
                DrawHeader(canvas);
                foreach (var draw in pages[i])
                {
                    draw(canvas);
                }

                DrawRule(canvas, FooterRule);
                DrawText(canvas, labels.Private, PdfLayout.InterSemiBold, 8, 12, Ink, Left, 715);
                DrawText(canvas, string.Format(CultureInfo.InvariantCulture, labels.Page, i + 1, pages.Count),
                    PdfLayout.Inter, 8, 12, Ink, 511, 715);
                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    /// <summary>Lays the children out from the top down, starting a new page when the next block won't fit.</summary>
    private sealed class Writer(Labels labels, string date)
    {
        private readonly List<List<Action<SKCanvas>>> _pages = [];
        private List<Action<SKCanvas>> _page = null!;
        private float _y;

        public List<List<Action<SKCanvas>>> Write(IReadOnlyList<AllergyPdfSection> children)
        {
            _page = [];
            _pages.Add(_page);
            Text(labels.Title, PdfLayout.HeadingBold, 28, 42, Left, 104);
            Text(string.Format(CultureInfo.InvariantCulture, labels.Generated, date), PdfLayout.Inter, 10, 15, Left, 153);
            _y = 193;
            foreach (var child in children)
            {
                Child(child);
            }

            // The closing rule and note, 31pt under the last child's notes (Figma: rule 365, note 386).
            Fit(52);
            var rule = _y;
            _page.Add(canvas => DrawRule(canvas, rule));
            Text(labels.Note, PdfLayout.Inter, 10, 15, Left, rule + 21);
            return _pages;
        }

        /// <summary>A child's band, then "Allergies and notes" and the notes, a line at a time across pages if needed.</summary>
        private void Child(AllergyPdfSection child)
        {
            var lines = Lines(child.AllergySummary, PdfLayout.Inter, 16, Width);
            // A child's whole section stays on one page when it fits on a fresh one; a longer one starts with at least
            // its band, heading and first line together and continues on the next page.
            var whole = 117 + (lines.Count * 24);
            Fit(whole <= Bottom - ContinuedTop ? whole : 117 + 24);
            Band(child.ChildName);
            Text(labels.Heading, PdfLayout.HeadingBold, 18, 27, Left, _y + 75);
            _y += 117;
            foreach (var line in lines)
            {
                if (_y + 24 > Bottom)
                {
                    NewPage();
                    Band($"{child.ChildName} {labels.Continued}");
                    _y += 59;
                }

                var top = _y;
                _page.Add(canvas => DrawText(canvas, line, PdfLayout.Inter, 16, 24, Ink, Left, top));
                _y += 24;
            }

            _y += 31;
        }

        /// <summary>The child's name on a soft rounded band, 44pt tall.</summary>
        private void Band(string name)
        {
            var top = _y;
            _page.Add(canvas =>
            {
                using var fill = new SKPaint { Color = BandFill, IsAntialias = true };
                canvas.DrawRoundRect(SKRect.Create(Left, top, Width, 44), 8, 8, fill);
            });
            Text(name, PdfLayout.InterSemiBold, 15, 22.5f, Left + 16, top + 11, Width - 32);
        }

        private void Fit(float height)
        {
            if (_y + height > Bottom)
            {
                NewPage();
            }
        }

        private void NewPage()
        {
            _page = [];
            _pages.Add(_page);
            _y = ContinuedTop;
        }

        /// <summary>Text in the brand ink; wrapped when it has a width, otherwise one line.</summary>
        private void Text(string text, SKTypeface face, float size, float lineHeight, float x, float top, float width = Width)
        {
            var lines = Lines(text, face, size, width);
            _page.Add(canvas =>
            {
                var y = top;
                foreach (var line in lines)
                {
                    DrawText(canvas, line, face, size, lineHeight, Ink, x, y);
                    y += lineHeight;
                }
            });
        }
    }

    private sealed record Labels(
        string Title, string Generated, string Heading, string Continued, string Note, string Private, string Page)
    {
        public static readonly Labels English = new(
            "Child allergy reference",
            "Generated {0} (UTC)",
            "Allergies and notes",
            "(continued)",
            "Allergy information entered by parents.",
            "PRIVATE FAMILY REFERENCE",
            "Page {0} of {1}");

        public static readonly Labels Spanish = new(
            "Referencia de alergias infantiles",
            "Generado el {0} (UTC)",
            "Alergias y notas",
            "(continuación)",
            "Información de alergias ingresada por los padres.",
            "REFERENCIA FAMILIAR PRIVADA",
            "Página {0} de {1}");
    }
}
