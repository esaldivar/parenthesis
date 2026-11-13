using System.Globalization;
using CoParent.Infrastructure.Pdf;
using NodaTime;
using NodaTime.Text;
using SkiaSharp;

namespace CoParent.Modules.SharedRecords;

/// <summary>Selectable, printable US Letter transaction report (#497, approved design #566).</summary>
internal sealed class RecordExportPdf(bool spanish, DateTimeZone zone)
{
    private const float Bottom = PdfLayout.PageHeight - PdfLayout.Margin - PdfLayout.FooterSpace;
    private static readonly SKColor _ink = new(34, 34, 34);
    private static readonly SKColor _muted = new(75, 75, 75);
    private static readonly SKColor _rule = new(190, 190, 190);
    private static readonly SKColor _panel = new(242, 242, 242);
    private static readonly OffsetPattern _offset = OffsetPattern.CreateWithInvariantCulture("+HH:mm");
    private static readonly Lazy<SKImage> _brand = new(LoadBrand);
    private static readonly string[] _months =
        ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    private string Title => Text("Shared Records Transaction Report", "Informe de transacciones de registros compartidos");

    public static byte[] Render(
        IReadOnlyList<RecordExportRow> rows, DateOnly from, DateOnly to, DateTimeZone zone, DateTimeOffset generated, bool spanish)
    {
        var renderer = new RecordExportPdf(spanish, zone);
        var pages = renderer.Layout(rows, from, to, generated);
        using var stream = new MemoryStream();
        using (var pdf = SKDocument.CreatePdf(stream, new SKDocumentPdfMetadata
        {
            Title = renderer.Title,
            Creator = "Parenthesis",
            Creation = generated.UtcDateTime,
        }))
        {
            for (var index = 0; index < pages.Count; index++)
            {
                var canvas = pdf.BeginPage(PdfLayout.PageWidth, PdfLayout.PageHeight);
                renderer.Draw(canvas, pages[index], index + 1, pages.Count);
                pdf.EndPage();
            }

            pdf.Close();
        }

        return stream.ToArray();
    }

    private List<Page> Layout(IReadOnlyList<RecordExportRow> rows, DateOnly from, DateOnly to, DateTimeOffset generated)
    {
        var pages = new List<Page> { new() };
        var page = pages[0];
        page.Add(Block.Of(Full(Title, 22, PdfLayout.Serif)));
        page.Add(Block.Of(Full(Text("Parenthesis export of parent-reported records", "Exportación de Parenthesis de registros informados por los padres"), 10, color: _muted), gap: 10));
        page.Add(new Block([
            Meta(Text("Inclusive submission range", "Intervalo inclusivo de envío"), $"{Date(from)} - {Date(to)}", 8, 165),
            Meta(Text("Display time zone", "Zona horaria"), zone.Id, 178, 113),
            Meta(Text("Generated", "Generado"), Timestamp(generated), 296, 200),
        ], Gap: 9, Shaded: true));

        foreach (var month in rows.GroupBy(row =>
        {
            var local = Local(row.SubmittedAt);
            return new DateOnly(local.Year, local.Month, 1);
        }))
        {
            Block? heading = MonthHeading(month.Key, continued: false);
            foreach (var row in month)
            {
                var transaction = Transaction(row);
                if (!page.Fits(transaction, heading))
                {
                    page = new Page();
                    pages.Add(page);
                    heading = MonthHeading(month.Key, continued: heading is null);
                }

                if (heading is not null)
                {
                    page.Add(heading);
                    heading = null;
                }

                page.Add(transaction);
            }

            var subtotals = Totals(month, Text("Month subtotals", "Subtotales del mes"));
            if (!page.Fits(subtotals))
            {
                page = new Page();
                pages.Add(page);
                page.Add(MonthHeading(month.Key, continued: true));
            }

            page.Add(subtotals);
        }

        var totals = Totals(rows, Text("Selected range totals", "Totales del intervalo seleccionado"));
        var notes = Block.Of(Full(Text(
            "Payment dates are entered by parents. Submission and response times are recorded by Parenthesis. " +
            "Record references link entries to original requests, including requests outside this range. Historical requester names were not captured.",
            "Los padres ingresan las fechas de pago. Parenthesis registra los horarios de envío y respuesta. " +
            "Las referencias vinculan las entradas con las solicitudes originales, incluso fuera del intervalo. No se registraron los nombres históricos de quienes enviaron las solicitudes."),
            8.5f, color: _muted), gap: 4);
        if (!page.Fits(totals, notes))
        {
            page = new Page();
            pages.Add(page);
        }

        page.Add(totals);
        page.Add(notes);
        return pages;
    }

    private Block MonthHeading(DateOnly month, bool continued)
    {
        var title = spanish
            ? string.Create(CultureInfo.InvariantCulture, $"{_months[month.Month - 1]} de {month.Year}")
            : month.ToString("MMMM yyyy", CultureInfo.InvariantCulture);
        if (continued)
        {
            title += Text(" (continued)", " (continuación)");
        }

        return new Block([
            Lines(Text("Record / reference", "Registro / referencia"), 8, PdfLayout.Bold, 0, 135),
            Lines(Text("Submitted by", "Enviado por"), 8, PdfLayout.Bold, 141, 100),
            Lines(Text("Recorded submission", "Envío registrado"), 8, PdfLayout.Bold, 245, 131),
            Lines(Text("Amount / status", "Monto / estado"), 8, PdfLayout.Bold, 380, 124),
        ], Gap: 7, Rule: true, Heading: Full(title, 14, PdfLayout.Bold, after: 5));
    }

    private Block Transaction(RecordExportRow row)
    {
        var title = string.Join(' ', row.Title.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var reference = $"{(row.Kind == RecordKind.Fund ? "SF" : "CS")}-{row.RecordId:N}";
        var record = Lines(title, 10, PdfLayout.Bold, 0, 135, preserve: true);
        record.AddRange(Lines($"{Kind(row.Kind)} / {Action(row)}", 8, PdfLayout.Regular, 0, 135, _muted));
        record.AddRange(Lines(reference, 6.5f, PdfLayout.Regular, 0, 135, _muted));
        if (row.EntryId is { } entry)
        {
            record.AddRange(Lines($"T-{entry:N}", 6.5f, PdfLayout.Regular, 0, 135, _muted));
        }

        var who = Lines(Text("Historical full name unavailable", "Nombre histórico no disponible"),
            9, PdfLayout.Regular, 141, 100, _muted);
        var submitted = Local(row.SubmittedAt);
        var submission = Lines(Date(submitted.Date.ToDateOnly()), 9, PdfLayout.Bold, 245, 130);
        submission.AddRange(Lines(Clock(submitted), 8.5f, PdfLayout.Regular, 245, 130, _muted));
        if (row.PaidOn is { } paid)
        {
            submission.AddRange(Lines($"{Text("Payment date", "Fecha de pago")} {Date(paid)}", 8, PdfLayout.Regular, 245, 130, _muted));
        }

        if (row.RespondedAt is { } responded)
        {
            submission.AddRange(Lines($"{Text("Response", "Respuesta")} {Timestamp(responded)}", 8, PdfLayout.Regular, 245, 130, _muted));
        }

        var amount = Right(row.AmountMinor is { } minor
            ? Amount(minor, row.Currency)
            : Text("No amount recorded", "Sin monto registrado"), 10, PdfLayout.Bold);
        if (row.Status is not null)
        {
            amount.AddRange(Right(Status(row), 8, PdfLayout.Regular, _muted));
        }

        return new Block([record, who, submission, amount], Gap: 8, Rule: true);
    }

    private Block Totals(IEnumerable<RecordExportRow> rows, string heading)
    {
        var lines = Full(heading, 11, PdfLayout.Bold, after: 3);
        var groups = rows.Where(r => r.AmountMinor.HasValue)
            .GroupBy(r => (r.Kind, r.Currency, Bucket: r.EntryId is null ? Action(r) : Status(r)))
            .OrderBy(g => g.Key.Kind).ThenBy(g => g.Key.Currency, StringComparer.Ordinal);
        foreach (var group in groups.GroupBy(g => (g.Key.Kind, g.Key.Currency)))
        {
            var amounts = string.Join("  •  ", group.Select(g => $"{Amount(g.Sum(r => r.AmountMinor!.Value), g.Key.Currency)} {g.Key.Bucket}"));
            lines.AddRange(Full($"{Kind(group.Key.Kind)}  |  {amounts}", 8.5f));
        }

        return Block.Of(lines, gap: 12);
    }

    private string Kind(RecordKind kind) => kind == RecordKind.Fund
        ? Text("Shared Fund", "Fondo compartido")
        : Text("Child Support", "Manutención infantil");

    private string Action(RecordExportRow row) => (row.EntryId.HasValue, row.Kind) switch
    {
        (false, RecordKind.Fund) => Text("Requested", "Solicitado"),
        (false, _) => Text("Reference amount", "Monto de referencia"),
        (true, RecordKind.Fund) => Text("Contribution", "Aporte"),
        _ => Text("Payment", "Pago"),
    };

    private string Status(RecordExportRow row) => (row.Status, row.PaidTo) switch
    {
        (EntryStatus.Disputed, _) => Text("Mismatch flagged", "Discrepancia señalada"),
        (EntryStatus.Acknowledged, PaidTo.CoParent) => Text("Receipt confirmed", "Recepción confirmada"),
        (EntryStatus.Acknowledged, _) => Text("Acknowledged", "Reconocido"),
        (EntryStatus.Pending, PaidTo.CoParent) => Text("Pending receipt confirmation", "Pendiente de confirmar recepción"),
        _ => Text("Pending acknowledgment", "Pendiente de reconocimiento"),
    };

    private ZonedDateTime Local(DateTimeOffset instant) => Instant.FromDateTimeOffset(instant).InZone(zone);

    private string Timestamp(DateTimeOffset instant)
    {
        var local = Local(instant);
        return $"{Date(local.Date.ToDateOnly())}, {Clock(local)}";
    }

    private string Clock(ZonedDateTime local)
    {
        var time = local.TimeOfDay.ToString(spanish ? "HH:mm:ss" : "h:mm:ss tt", CultureInfo.InvariantCulture);
        return $"{time} UTC{_offset.Format(local.Offset)}";
    }

    private string Date(DateOnly date) => date.ToString(spanish ? "dd/MM/yyyy" : "MMM d, yyyy", CultureInfo.InvariantCulture);

    private static string Amount(long minor, string currency) =>
        string.Create(CultureInfo.InvariantCulture, $"{minor / 100m:N2} {currency}");

    private string Text(string english, string translation) => spanish ? translation : english;

    private static List<PdfLine> Meta(string title, string value, float indent, float width)
    {
        var lines = Lines(title, 8, PdfLayout.Bold, indent, width, _muted);
        lines.AddRange(Lines(value, 9.5f, PdfLayout.Regular, indent, width));
        return lines;
    }

    private static List<PdfLine> Full(string value, float size, SKTypeface? face = null, float after = 0, SKColor? color = null) =>
        PdfLayout.Wrap(value, face ?? PdfLayout.Regular, size, color ?? _ink, 0, after);

    private static List<PdfLine> Lines(string value, float size, SKTypeface face, float indent, float width, SKColor? color = null, bool preserve = false) =>
        PdfLayout.Wrap(value, face, size, color ?? _ink, indent, 0, width, preserve);

    private static List<PdfLine> Right(string value, float size, SKTypeface face, SKColor? color = null)
    {
        using var font = PdfLayout.Font(face, size);
        return Lines(value, size, face, 0, 124, color)
            .Select(line => line with { Indent = PdfLayout.ContentWidth - font.MeasureText(line.Text) }).ToList();
    }

    private void Draw(SKCanvas canvas, Page page, int number, int total)
    {
        const float left = PdfLayout.Margin;
        var mark = _brand.Value;
        canvas.DrawImage(mark, new SKRect(left, 42, left + 26, 66), new SKSamplingOptions(SKFilterMode.Linear));
        PdfLayout.Draw(canvas, Lines("Parenthesis", 10, PdfLayout.Bold, 34, 150), _rule, 48);
        Rule(canvas, 73);

        var y = Page.Top;
        foreach (var block in page.Blocks)
        {
            if (block.Shaded)
            {
                using var paint = new SKPaint { Color = _panel };
                canvas.DrawRect(left, y - 3, PdfLayout.ContentWidth, block.Height - 2, paint);
            }

            var columnTop = y;
            if (block.Heading is { } heading)
            {
                PdfLayout.Draw(canvas, heading, _rule, y);
                columnTop += heading.Sum(line => line.Height);
            }

            foreach (var column in block.Columns)
            {
                PdfLayout.Draw(canvas, column, _rule, columnTop);
            }

            y += block.Height;
            if (block.Rule)
            {
                Rule(canvas, y - 5);
            }
        }

        Rule(canvas, PdfLayout.PageHeight - 48);
        PdfLayout.Footer(canvas, Text("Shared Records / Private family export", "Registros compartidos / Exportación familiar privada"), _muted);
        var pageText = Text($"Page {number} of {total}", $"Página {number} de {total}");
        using var font = PdfLayout.Font(PdfLayout.Bold, 8);
        using var ink = new SKPaint { Color = _ink, IsAntialias = true };
        canvas.DrawText(pageText, PdfLayout.PageWidth - left, PdfLayout.PageHeight - (left / 2),
            SKTextAlign.Right, font, ink);
    }

    private static void Rule(SKCanvas canvas, float y)
    {
        using var paint = new SKPaint { Color = _rule, StrokeWidth = 0.6f };
        canvas.DrawLine(PdfLayout.Margin, y, PdfLayout.PageWidth - PdfLayout.Margin, y, paint);
    }

    private static SKImage LoadBrand()
    {
        using var stream = typeof(PdfLayout).Assembly.GetManifestResourceStream("CoParent.Infrastructure.Email.parenthesis-icon.png")
            ?? throw new InvalidOperationException("The approved Parenthesis icon is missing.");
        using var data = SKData.Create(stream);
        return SKImage.FromEncodedData(data) ?? throw new InvalidOperationException("The approved Parenthesis icon could not be decoded.");
    }

    private sealed record Block(IReadOnlyList<List<PdfLine>> Columns, float Gap, bool Rule = false, bool Shaded = false, List<PdfLine>? Heading = null)
    {
        public float Height => (Heading?.Sum(line => line.Height) ?? 0) + Columns.Max(c => c.Sum(line => line.Height)) + Gap;

        public static Block Of(List<PdfLine> lines, float gap = 0) => new([lines], gap);
    }

    private sealed class Page
    {
        public const float Top = 86;
        private float _height = Top;
        public List<Block> Blocks { get; } = [];

        public bool Fits(Block block, Block? extra = null) => _height + block.Height + (extra?.Height ?? 0) <= Bottom;

        public void Add(Block block)
        {
            Blocks.Add(block);
            _height += block.Height;
        }
    }
}
