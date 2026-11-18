using System.Xml.Linq;
using CoParent.Infrastructure.Pdf;
using SkiaSharp;

namespace CoParent.Modules.Families.Infrastructure.Pdf;

/// <summary>
/// What the branded Child Essentials PDFs share (Medical reference #659, allergy reference #662): US Letter margins,
/// the approved Parenthesis logo and the rule under it, the restrained theme colours, and text drawn in the app's
/// typefaces (Inter, Nunito Sans), falling back to Noto Sans for characters they don't have.
/// </summary>
internal static class BrandedPdf
{
    public const float Left = 42;
    public const float Width = 528;
    public const float Right = Left + Width;

    /// <summary>The footer rule; page bodies stop above it.</summary>
    public const float FooterRule = 698;

    public static readonly SKColor Ink = new(0x20, 0x3A, 0x31);
    public static readonly SKColor Muted = new(0x4D, 0x62, 0x58);
    public static readonly SKColor RuleColor = new(0xCF, 0xD7, 0xC9);
    public static readonly SKColor BandFill = new(0xED, 0xF2, 0xE8);
    private static readonly SKColor _wordmarkParent = new(0x5E, 0x8F, 0x7E);
    private static readonly SKColor _wordmarkHesis = new(0x20, 0x30, 0x3F);
    private static readonly Lazy<SKPicture> _icon = new(LoadIcon);

    public static List<string> Lines(string text, SKTypeface face, float size, float width) =>
        PdfLayout.Wrap(text, Face(face, text), size, SKColors.Black, 0, 0, width).Select(line => line.Text).ToList();

    public static float Measure(string text, SKTypeface face, float size)
    {
        using var font = PdfLayout.Font(Face(face, text), size);
        return font.MeasureText(text);
    }

    /// <summary>The app's typeface, or Noto Sans for text it has no characters for (such as Vietnamese or Cyrillic names).</summary>
    public static SKTypeface Face(SKTypeface face, string text)
    {
        using var font = PdfLayout.Font(face, 10);
        if (font.ContainsGlyphs(text.Replace("\n", "", StringComparison.Ordinal)))
        {
            return face;
        }

        return face == PdfLayout.Inter ? PdfLayout.Regular : PdfLayout.Bold;
    }

    /// <summary>Draws a line vertically centred in its line box, as the design tool places text.</summary>
    public static void DrawText(SKCanvas canvas, string text, SKTypeface face, float size, float lineHeight, SKColor color,
        float x, float top, SKTextAlign align = SKTextAlign.Left)
    {
        using var font = PdfLayout.Font(Face(face, text), size);
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        var metrics = font.Metrics;
        var baseline = top + ((lineHeight - (metrics.Descent - metrics.Ascent)) / 2) - metrics.Ascent;
        canvas.DrawText(text, x, baseline, align, font, paint);
    }

    public static void DrawRule(SKCanvas canvas, float y)
    {
        using var fill = new SKPaint { Color = RuleColor, IsAntialias = true };
        canvas.DrawRect(SKRect.Create(Left, y, Width, 0.6f), fill);
    }

    /// <summary>The logo (icon unchanged, then the text wordmark in its approved colours) and the rule under it.</summary>
    public static void DrawHeader(SKCanvas canvas)
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

    private static SKPicture LoadIcon()
    {
        using var source = typeof(BrandedPdf).Assembly.GetManifestResourceStream("Parenthesis.BrandIcon.svg")
            ?? throw new InvalidOperationException("The Parenthesis icon isn't embedded.");
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
}
