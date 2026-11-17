using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using CoParent.Infrastructure.Pdf;
using CoParent.Modules.Families.Endpoints;
using SkiaSharp;

namespace CoParent.Modules.Families.Infrastructure.Pdf;

/// <summary>
/// One child's part of the Medical reference: their providers and medication. <c>Discontinued</c> is null when the
/// parent chose current medications only.
/// </summary>
internal sealed record MedicalReferenceSection(
    string ChildName,
    IReadOnlyList<MedicalProvider> Providers,
    IReadOnlyList<MedicationEntry> Current,
    IReadOnlyList<MedicationEntry>? Discontinued);

/// <summary>
/// The printable Medical reference (#659), drawn to the approved Figma layout 221:2: the Parenthesis logo, the child's
/// summary band, provider contact boxes, a medication table and a short "About this reference" note on US Letter pages.
/// Each child starts a new page; a page that runs over repeats the logo and the child's band. Everything shown is what
/// parents entered: nothing is counted, named or numbered ahead of time.
/// </summary>
internal static partial class MedicalReferencePdf
{
    private const float Left = 42;
    private const float Width = 528;
    private const float Right = Left + Width;

    /// <summary>The body stops above the footer rule (y 698).</summary>
    private const float Bottom = 686;

    private const float ContinuedTop = 95;

    private static readonly SKColor _heading = new(0x20, 0x3A, 0x31);
    private static readonly SKColor _muted = new(0x4D, 0x62, 0x58);
    private static readonly SKColor _rule = new(0xCF, 0xD7, 0xC9);
    private static readonly SKColor _band = new(0xED, 0xF2, 0xE8);
    private static readonly SKColor _wordmarkParent = new(0x5E, 0x8F, 0x7E);
    private static readonly SKColor _wordmarkHesis = new(0x20, 0x30, 0x3F);
    private static readonly Lazy<SKPicture> _icon = new(LoadIcon);

    /// <summary>Medication table columns (x, width), as in the approved layout.</summary>
    private static readonly (float X, float Width)[] _columns = [(42, 145), (194, 130), (335, 115), (461, 109)];

    public static byte[] Render(
        IReadOnlyList<MedicalReferenceSection> children, DateTimeOffset generatedAt, string date, bool spanish = false)
    {
        ArgumentNullException.ThrowIfNull(children);
        var labels = spanish ? Labels.Spanish : Labels.English;
        var pages = new List<Page>();
        foreach (var child in children)
        {
            new Writer(pages, child, labels).Write();
        }

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
                foreach (var draw in pages[i].Draws)
                {
                    draw(canvas);
                }

                DrawFooter(canvas, labels, string.Format(CultureInfo.InvariantCulture, labels.Page, i + 1, pages.Count), date);
                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    /// <summary>
    /// Shows a U.S. phone number as (XXX) XXX-XXXX, keeping any extension, like the app (School #655, Medical #659).
    /// Anything else, such as an international number, is shown exactly as the parent typed it.
    /// </summary>
    internal static string PhoneDisplay(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var extension = Extension().Match(value);
        var number = (extension.Success ? value[..extension.Index] : value).Trim();
        if (!PhoneCharacters().IsMatch(number))
        {
            return value;
        }

        var digits = new string(number.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length == 11 && digits[0] == '1')
        {
            digits = digits[1..];
        }
        else if (number.StartsWith('+'))
        {
            return value;
        }

        if (digits.Length != 10)
        {
            return value;
        }

        var formatted = $"({digits[..3]}) {digits[3..6]}-{digits[6..]}";
        return extension.Success ? $"{formatted} {extension.Value.Trim()}" : formatted;
    }

    [GeneratedRegex(@"(?:ext\.?|extension|x|#)\s*\d{1,6}\s*$", RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 100)]
    private static partial Regex Extension();

    [GeneratedRegex(@"^[\d\s().+-]+$", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex PhoneCharacters();

    private sealed class Page
    {
        public List<Action<SKCanvas>> Draws { get; } = [];
    }

    /// <summary>Lays out one child's pages from the top down, starting a continuation page when the next block won't fit.</summary>
    private sealed class Writer(List<Page> pages, MedicalReferenceSection child, Labels labels)
    {
        private Page _page = null!;
        private float _y;

        public void Write()
        {
            _page = new Page();
            pages.Add(_page);
            Text(labels.Title, PdfLayout.HeadingBold, 28, 36.4f, _heading, Left, 90, Width);
            Text(labels.Subtitle, PdfLayout.Inter, 10, 13, _muted, Left, 130, Width);
            Band(160, continued: false);
            _y = 212;

            Heading(labels.Providers, 33, 91);
            if (child.Providers.Count == 0)
            {
                Text(labels.NoProviders, PdfLayout.InterSemiBold, 11, 14.3f, _heading, Left, _y, Width);
                _y += 26;
            }

            foreach (var provider in child.Providers)
            {
                Provider(provider);
            }

            _y += 3;
            Medication(labels.CurrentMedications, child.Current, labels.NoCurrent);
            if (child.Discontinued is { Count: > 0 } discontinued)
            {
                _y += 8;
                Medication(labels.DiscontinuedMedications, discontinued, empty: null);
            }

            About();
        }

        private void NewPage()
        {
            _page = new Page();
            pages.Add(_page);
            Band(ContinuedTop, continued: true);
            _y = ContinuedTop + 52;
        }

        private void Fit(float height)
        {
            if (_y + height > Bottom)
            {
                NewPage();
            }
        }

        /// <summary>A section heading, kept on the same page as at least <paramref name="keep"/> points of what follows.</summary>
        private void Heading(string text, float advance, float keep)
        {
            Fit(advance + keep);
            Text(text, PdfLayout.HeadingBold, 17, 22.1f, _heading, Left, _y, Width);
            _y += advance;
        }

        /// <summary>The child's name and what this reference holds for them, on a soft band.</summary>
        private void Band(float top, bool continued)
        {
            var counts = labels.Counts(child.Providers.Count, child.Current.Count);
            var countsWidth = Measure(counts, PdfLayout.Inter, 9);
            var name = continued ? $"{child.ChildName} {labels.Continued}" : child.ChildName;
            _page.Draws.Add(canvas =>
            {
                using var fill = new SKPaint { Color = _band, IsAntialias = true };
                canvas.DrawRoundRect(SKRect.Create(Left, top, Width, 37), 8, 8, fill);
            });
            // The name starts 61pt in (Figma), or further when a translated label is wider ("NIÑO O NIÑA").
            var nameX = Left + Math.Max(61, 14 + Measure(labels.Child, PdfLayout.InterSemiBold, 8) + 10);
            Text(labels.Child, PdfLayout.InterSemiBold, 8, 11, _muted, Left + 14, top + 13, null);
            Text(Fit(name, PdfLayout.InterSemiBold, 12, Right - 6 - countsWidth - 12 - nameX), PdfLayout.InterSemiBold, 12, 16,
                _heading, nameX, top + 11, null);
            Text(counts, PdfLayout.Inter, 9, 12, _muted, Right - 6, top + 12, null, SKTextAlign.Right);
        }

        /// <summary>A provider's box: type, name and practice on the left; phone and address on the right.</summary>
        private void Provider(MedicalProvider provider)
        {
            const float column = 236;
            var type = (provider.Specialty ?? labels.Type(provider.Type)).ToUpper(labels.Culture);
            var name = Lines(provider.Name, PdfLayout.InterSemiBold, 12, column);
            var practice = provider.Practice is null ? [] : Lines(provider.Practice, PdfLayout.Inter, 10, column);
            var phone = provider.Phone is null ? [] : Lines(PhoneDisplay(provider.Phone), PdfLayout.InterSemiBold, 10, 238);
            var address = provider.Address is null ? [] : Lines(provider.Address, PdfLayout.Inter, 9, 238);
            var left = 11 + 6 + (name.Count * 16) + (practice.Count > 0 ? 6 + (practice.Count * 13) : 0);
            var right = (phone.Count > 0 ? 11 + 5 + (phone.Count * 13) : 0) +
                (address.Count > 0 ? (phone.Count > 0 ? 5 : 0) + 11 + 5 + (address.Count * 12) : 0);
            var height = Math.Max(91, 12.65f + Math.Max(left, right) + 16);
            Fit(height);
            var top = _y;
            _page.Draws.Add(canvas =>
            {
                var box = new SKRoundRect(SKRect.Create(Left, top, Width, height), 8);
                using var fill = new SKPaint { Color = SKColors.White, IsAntialias = true };
                using var stroke = new SKPaint { Color = _rule, IsStroke = true, StrokeWidth = 0.65f, IsAntialias = true };
                canvas.DrawRoundRect(box, fill);
                canvas.DrawRoundRect(box, stroke);
            });

            var x = Left + 15.65f;
            var y = top + 12.65f;
            Text(type, PdfLayout.InterSemiBold, 8, 11, _muted, x, y, column);
            y += 17;
            y = Block(name, PdfLayout.InterSemiBold, 12, 16, _heading, x, y);
            if (practice.Count > 0)
            {
                Block(practice, PdfLayout.Inter, 10, 13, _muted, x, y + 6);
            }

            x = Left + 275.65f;
            y = top + 12.65f;
            if (phone.Count > 0)
            {
                Text(labels.Phone, PdfLayout.InterSemiBold, 8, 11, _muted, x, y, 238);
                y = Block(phone, PdfLayout.InterSemiBold, 10, 13, _heading, x, y + 16) + 5;
            }

            if (address.Count > 0)
            {
                Text(labels.Address, PdfLayout.InterSemiBold, 8, 11, _muted, x, y, 238);
                Block(address, PdfLayout.Inter, 9, 12, _heading, x, y + 16);
            }

            _y = top + height + 12;
        }

        /// <summary>A medication heading over a ruled table; rows that run over a page repeat the column labels.</summary>
        private void Medication(string heading, IReadOnlyList<MedicationEntry> entries, string? empty)
        {
            Heading(heading, 0, entries.Count == 0 ? 132 : 84);
            var rule = _y + 31;
            Rule(rule);
            _y += 46;
            if (entries.Count == 0)
            {
                Text(empty!, PdfLayout.InterSemiBold, 11, 14.3f, _heading, Left, _y, Width);
                Text(labels.EmptyHint, PdfLayout.Inter, 9, 12, _muted, Left, _y + 23, Width);
                ColumnLabels(_y + 44);
                Rule(_y + 67);
                _y += 86;
                return;
            }

            ColumnLabels(_y);
            Rule(_y + 19);
            _y += 26;
            foreach (var entry in entries)
            {
                string[] values = [entry.Name, entry.Dose ?? "—", entry.Schedule ?? "—", entry.Instructions ?? "—"];
                var cells = values.Select((value, i) =>
                    Lines(value, i == 0 ? PdfLayout.InterSemiBold : PdfLayout.Inter, 9, _columns[i].Width - 6)).ToList();
                var height = cells.Max(cell => cell.Count) * 12;
                if (_y + height + 13 > Bottom)
                {
                    NewPage();
                    ColumnLabels(_y);
                    Rule(_y + 19);
                    _y += 26;
                }

                // A single entry taller than a page is split across pages, a line at a time.
                var line = 0;
                while (line < cells.Max(cell => cell.Count))
                {
                    var fit = Math.Max(1, (int)((Bottom - 13 - _y) / 12));
                    var take = Math.Min(fit, cells.Max(cell => cell.Count) - line);
                    for (var i = 0; i < cells.Count; i++)
                    {
                        var part = cells[i].Skip(line).Take(take).ToList();
                        Block(part, i == 0 ? PdfLayout.InterSemiBold : PdfLayout.Inter, 9, 12, _heading, _columns[i].X, _y);
                    }

                    line += take;
                    _y += take * 12;
                    Rule(_y + 6);
                    _y += 13;
                    if (line < cells.Max(cell => cell.Count))
                    {
                        NewPage();
                        ColumnLabels(_y);
                        Rule(_y + 19);
                        _y += 26;
                    }
                }
            }

            _y += 6;
        }

        private void ColumnLabels(float top)
        {
            string[] names = [labels.ColumnName, labels.ColumnDose, labels.ColumnSchedule, labels.ColumnInstructions];
            for (var i = 0; i < names.Length; i++)
            {
                Text(names[i], PdfLayout.InterSemiBold, 8, 11, _muted, _columns[i].X, top, _columns[i].Width - 6);
            }
        }

        private void About()
        {
            var lines = labels.AboutLines.Select(line => Lines(line, PdfLayout.Inter, 8, Width)).ToList();
            Fit(20 + lines.Sum(line => (line.Count * 11) + 5));
            Text(labels.About, PdfLayout.InterSemiBold, 10, 13, _heading, Left, _y, Width);
            var y = _y + 20;
            foreach (var line in lines)
            {
                y = Block(line, PdfLayout.Inter, 8, 11, _muted, Left, y) + 5;
            }

            _y = y;
        }

        private void Rule(float y)
        {
            _page.Draws.Add(canvas => DrawRule(canvas, y));
        }

        private float Block(IReadOnlyList<string> lines, SKTypeface face, float size, float lineHeight, SKColor color, float x, float top)
        {
            foreach (var line in lines)
            {
                Text(line, face, size, lineHeight, color, x, top, null);
                top += lineHeight;
            }

            return top;
        }

        private void Text(string text, SKTypeface face, float size, float lineHeight, SKColor color, float x, float top,
            float? maxWidth, SKTextAlign align = SKTextAlign.Left)
        {
            var lines = maxWidth is { } width ? Lines(text, face, size, width) : [text];
            _page.Draws.Add(canvas =>
            {
                var y = top;
                foreach (var line in lines)
                {
                    DrawText(canvas, line, face, size, lineHeight, color, x, y, align);
                    y += lineHeight;
                }
            });
        }

        /// <summary>The text cut with an ellipsis to fit one line.</summary>
        private static string Fit(string text, SKTypeface face, float size, float width)
        {
            if (Measure(text, face, size) <= width)
            {
                return text;
            }

            var cut = text;
            while (cut.Length > 1 && Measure(cut + "…", face, size) > width)
            {
                cut = cut[..^1];
            }

            return cut.TrimEnd() + "…";
        }
    }

    private static List<string> Lines(string text, SKTypeface face, float size, float width) =>
        PdfLayout.Wrap(text, Face(face, text), size, SKColors.Black, 0, 0, width).Select(line => line.Text).ToList();

    private static float Measure(string text, SKTypeface face, float size)
    {
        using var font = PdfLayout.Font(Face(face, text), size);
        return font.MeasureText(text);
    }

    /// <summary>The app's typeface, or Noto Sans for text it has no characters for (such as Vietnamese or Cyrillic names).</summary>
    private static SKTypeface Face(SKTypeface face, string text)
    {
        using var font = PdfLayout.Font(face, 10);
        if (font.ContainsGlyphs(text.Replace("\n", "", StringComparison.Ordinal)))
        {
            return face;
        }

        return face == PdfLayout.Inter ? PdfLayout.Regular : PdfLayout.Bold;
    }

    /// <summary>Draws a line vertically centred in its line box, as the design tool places text.</summary>
    private static void DrawText(SKCanvas canvas, string text, SKTypeface face, float size, float lineHeight, SKColor color,
        float x, float top, SKTextAlign align = SKTextAlign.Left)
    {
        using var font = PdfLayout.Font(Face(face, text), size);
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        var metrics = font.Metrics;
        var baseline = top + ((lineHeight - (metrics.Descent - metrics.Ascent)) / 2) - metrics.Ascent;
        canvas.DrawText(text, x, baseline, align, font, paint);
    }

    private static void DrawRule(SKCanvas canvas, float y)
    {
        using var fill = new SKPaint { Color = _rule, IsAntialias = true };
        canvas.DrawRect(SKRect.Create(Left, y, Width, 0.6f), fill);
    }

    /// <summary>The logo (icon unchanged, then the text wordmark in its approved colours) and the rule under it.</summary>
    private static void DrawHeader(SKCanvas canvas)
    {
        canvas.Save();
        canvas.Translate(Left, 34);
        canvas.Scale(41.366f / 188);
        canvas.DrawPicture(_icon.Value);
        canvas.Restore();
        var x = Left + 47.41f;
        using var font = PdfLayout.Font(PdfLayout.Bold, 25.2f);
        DrawText(canvas, "Parent", PdfLayout.Bold, 25.2f, 26, _wordmarkParent, x, 40.15f);
        DrawText(canvas, "hesis", PdfLayout.Bold, 25.2f, 26, _wordmarkHesis, x + font.MeasureText("Parent"), 40.15f);
        DrawRule(canvas, 83);
    }

    private static void DrawFooter(SKCanvas canvas, Labels labels, string page, string date)
    {
        DrawRule(canvas, 698);
        DrawText(canvas, labels.Private, PdfLayout.InterSemiBold, 8, 11, _muted, Left, 709);
        DrawText(canvas, string.Format(CultureInfo.InvariantCulture, labels.Generated, date), PdfLayout.Inter, 8, 11, _muted, Left, 722);
        DrawText(canvas, page, PdfLayout.Inter, 8, 11, _muted, Right, 718, SKTextAlign.Right);
    }

    private static SKPicture LoadIcon()
    {
        using var source = typeof(MedicalReferencePdf).Assembly.GetManifestResourceStream("Parenthesis.MedicalReferenceIcon.svg")
            ?? throw new InvalidOperationException("The Medical reference icon isn't embedded.");
        // The repository's fixed icon: even-odd filled paths in one group translated by (19, 25), in its own colours.
        var svg = XDocument.Load(source);
        using var recorder = new SKPictureRecorder();
        var canvas = recorder.BeginRecording(SKRect.Create(188, 174));
        canvas.Translate(19, 25);
        using var paint = new SKPaint { IsAntialias = true };
        foreach (var element in svg.Descendants(XName.Get("path", "http://www.w3.org/2000/svg")))
        {
            paint.Color = SKColor.Parse((string?)element.Attribute("fill") ?? "#000000");
            using var path = SKPath.ParseSvgPathData((string?)element.Attribute("d") ?? "");
            path.FillType = SKPathFillType.EvenOdd;
            canvas.DrawPath(path, paint);
        }

        return recorder.EndRecording();
    }

    private sealed record Labels(
        CultureInfo Culture,
        string Title,
        string Subtitle,
        string Child,
        string Continued,
        string Providers,
        string NoProviders,
        string Phone,
        string Address,
        string CurrentMedications,
        string DiscontinuedMedications,
        string NoCurrent,
        string EmptyHint,
        string ColumnName,
        string ColumnDose,
        string ColumnSchedule,
        string ColumnInstructions,
        string About,
        IReadOnlyList<string> AboutLines,
        string Private,
        string Generated,
        string Page,
        IReadOnlyDictionary<string, string> Types,
        Func<int, int, string> Counts)
    {
        public string Type(string type) => Types.GetValueOrDefault(type, type);

        public static readonly Labels English = new(
            CultureInfo.InvariantCulture,
            "Medical reference",
            "Provider contacts and medication information entered by parents.",
            "CHILD",
            "(continued)",
            "Medical providers",
            "No medical providers.",
            "PHONE",
            "PRACTICE ADDRESS",
            "Current medications",
            "Discontinued medications",
            "No current medications.",
            "Medication entries will show these parent-entered details:",
            "Medication name",
            "Prescribed dose",
            "Schedule",
            "Instructions",
            "About this reference",
            [
                "Parenthesis does not give medical advice, calculate doses, or track whether a dose was given.",
                "Information is entered and maintained by parents. Confirm details with the relevant provider.",
                "Parent-entered reference information; this document is not a prescription.",
            ],
            "PRIVATE FAMILY REFERENCE",
            "Generated {0} (UTC)",
            "Page {0} of {1}",
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Doctor"] = "Doctor",
                ["Dentist"] = "Dentist",
                ["Optometrist"] = "Optometrist",
                ["Other"] = "Other",
            },
            (providers, medications) =>
                $"{providers} {(providers == 1 ? "provider" : "providers")} / " +
                $"{medications} {(medications == 1 ? "current medication" : "current medications")}");

        public static readonly Labels Spanish = new(
            CultureInfo.InvariantCulture,
            "Referencia médica",
            "Contactos de profesionales e información de medicamentos ingresados por los padres.",
            "NIÑO O NIÑA",
            "(continuación)",
            "Profesionales de salud",
            "No hay profesionales de salud.",
            "TELÉFONO",
            "DIRECCIÓN DEL CONSULTORIO",
            "Medicamentos actuales",
            "Medicamentos suspendidos",
            "No hay medicamentos actuales.",
            "Los medicamentos mostrarán estos datos ingresados por los padres:",
            "Nombre del medicamento",
            "Dosis recetada",
            "Horario",
            "Instrucciones",
            "Acerca de esta referencia",
            [
                "Parenthesis no da consejos médicos, no calcula dosis ni registra si se dio una dosis.",
                "La información la ingresan y mantienen los padres. Confirma los datos con el profesional correspondiente.",
                "Información de referencia ingresada por los padres; este documento no es una receta.",
            ],
            "REFERENCIA FAMILIAR PRIVADA",
            "Generado el {0} (UTC)",
            "Página {0} de {1}",
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Doctor"] = "Médico",
                ["Dentist"] = "Dentista",
                ["Optometrist"] = "Optometrista",
                ["Other"] = "Otro",
            },
            (providers, medications) =>
                $"{providers} {(providers == 1 ? "profesional" : "profesionales")} / " +
                $"{medications} {(medications == 1 ? "medicamento actual" : "medicamentos actuales")}");
    }
}
