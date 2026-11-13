using System.Globalization;
using NodaTime;
using NodaTime.Text;

namespace CoParent.Modules.Messaging.Infrastructure.Transcripts;

/// <summary>Export copy and date formatting for the API's invariant globalization environment.</summary>
internal sealed record TranscriptLabels(
    string Title,
    string Description,
    string Participants,
    string InclusiveRange,
    string DisplayTimeZone,
    string Generated,
    string AllMessages,
    string FormerParent,
    string LinkedEvent,
    string Continued,
    string NoMessages,
    string SingularMessage,
    string PluralMessages,
    string PagePattern,
    bool Spanish)
{
    private static readonly CultureInfo _invariant = CultureInfo.InvariantCulture;
    private static readonly OffsetPattern _offset = OffsetPattern.CreateWithInvariantCulture("+HH:mm");
    private static readonly string[] _months =
        ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    private static readonly string[] _weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

    private static readonly TranscriptLabels _english = new(
        "Communication Transcript", "Parenthesis export of recorded messages", "Participants", "Inclusive date range",
        "Display time zone", "Generated", "All messages", "Former parent", "Linked Calendar Event", "(continued)",
        "No messages.", "message", "messages", "Page {0} of {1}", false);

    private static readonly TranscriptLabels _spanish = new(
        "Transcripción de comunicaciones", "Exportación de mensajes registrados en Parenthesis", "Participantes",
        "Rango de fechas inclusivo", "Zona horaria", "Generado", "Todos los mensajes", "Progenitor anterior",
        "Evento de calendario vinculado", "(continuación)", "No hay mensajes.", "mensaje", "mensajes",
        "Página {0} de {1}", true);

    public static TranscriptLabels For(string? language) => language == "es-419" ? _spanish : _english;

    public string ParticipantSeparator => Spanish ? " y " : " and ";

    public string Date(DateOnly date, bool includeWeekday = false)
    {
        if (!Spanish)
        {
            return date.ToString(includeWeekday ? "dddd, MMMM d, yyyy" : "MMMM d, yyyy", _invariant);
        }

        var day = string.Create(_invariant, $"{date.Day} de {_months[date.Month - 1]} de {date.Year}");
        return includeWeekday ? $"{_weekdays[(int)date.DayOfWeek]}, {day}" : day;
    }

    public string Range(DateOnly from, DateOnly to) => from == to ? Date(from) : $"{Date(from)} – {Date(to)}";

    public string Timestamp(ZonedDateTime time)
    {
        var clock = time.TimeOfDay.ToString(Spanish ? "HH:mm:ss" : "h:mm:ss tt", _invariant);
        return $"{Date(time.Date.ToDateOnly())} • {clock} {UtcOffset(time.Offset)}";
    }

    public static string UtcOffset(Offset offset) => $"UTC{_offset.Format(offset)}";

    public string Count(int count) => $"{count} {(count == 1 ? SingularMessage : PluralMessages)}";

    public string Page(int current, int total) => string.Format(_invariant, PagePattern, current, total);
}
