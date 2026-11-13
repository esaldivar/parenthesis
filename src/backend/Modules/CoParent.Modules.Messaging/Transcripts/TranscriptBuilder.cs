using System.Globalization;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Messaging.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NodaTime;

namespace CoParent.Modules.Messaging.Transcripts;

/// <summary>One message in a transcript: its family-local time, who sent it, and what it said.</summary>
internal sealed record TranscriptMessage(string Time, string Sender, string Text, string? Event);

/// <summary>A day's messages, under its family-local date ("Friday, November 6, 2026").</summary>
internal sealed record TranscriptDay(DateOnly Date, string Label, IReadOnlyList<TranscriptMessage> Messages);

/// <summary>
/// A transcript as the PDF and the in-app preview both show it, so the preview is exactly what will be saved or
/// downloaded. Times are in the family's time zone.
/// </summary>
internal sealed record TranscriptDocument(
    string FileName,
    string Title,
    string RangeLabel,
    string TimeZone,
    string Participants,
    DateTimeOffset PreparedAt,
    string PreparedLabel,
    TranscriptLabels Labels,
    DateOnly? From,
    DateOnly? To,
    int MessageCount,
    IReadOnlyList<TranscriptDay> Days);

/// <summary>Which messages a transcript holds: all of them, or the family-local dates from and to, both included.</summary>
internal readonly record struct TranscriptRange(DateOnly? From, DateOnly? To)
{
    /// <summary>Field errors for a requested range, keyed like the request; empty when it's fine.</summary>
    public static Dictionary<string, string[]> Validate(DateOnly? from, DateOnly? to)
    {
        var errors = new Dictionary<string, string[]>();
        if (from is null != to is null)
        {
            errors[from is null ? "from" : "to"] = ["Choose a start and an end date, or All messages."];
        }
        else if (from > to)
        {
            errors["to"] = ["The end date can’t be before the start date."];
        }

        return errors;
    }
}

/// <summary>
/// Builds a parent's transcript of the conversation (#125, slice 3). Ranges use the family's time zone: from local
/// midnight on the start date up to local midnight after the end date. Event links are recorded without calendar details.
/// </summary>
internal sealed class TranscriptBuilder(MessagingDbContext db, IFamilyRoster roster, TimeProvider clock)
{
    /// <summary>The most messages one transcript holds; a longer range has to be split.</summary>
    public const int MaxMessages = 5000;

    // The API runs in invariant globalization mode; the invariant culture uses English month and day names.
    private static readonly CultureInfo _english = CultureInfo.InvariantCulture;

    /// <summary>The transcript, or null when the range holds more than <see cref="MaxMessages"/> messages.</summary>
    public async Task<TranscriptDocument?> BuildAsync(TranscriptRange range, string? language, CancellationToken ct)
    {
        var timeZoneId = await roster.TimeZoneAsync(ct);
        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZoneId) ?? DateTimeZone.Utc;

        var query = db.Messages.AsNoTracking();
        if (range is { From: { } from, To: { } to })
        {
            // PostgreSQL timestamptz takes UTC only.
            if (from > DateOnly.MinValue)
            {
                var start = StartOfDay(zone, LocalDate.FromDateOnly(from));
                query = query.Where(m => m.SentAt >= start);
            }

            if (to < DateOnly.MaxValue)
            {
                var end = StartOfDay(zone, LocalDate.FromDateOnly(to).PlusDays(1));
                query = query.Where(m => m.SentAt < end);
            }
        }

        // One read, one more than the cap: a message sent meanwhile can't push a transcript past it.
        var messages = await query.OrderBy(m => m.SentAt).ThenBy(m => m.Sequence).Take(MaxMessages + 1).ToListAsync(ct);
        if (messages.Count > MaxMessages)
        {
            return null;
        }
        var names = await roster.ActiveParentNamesAsync(ct);
        var copy = TranscriptLabels.For(language);
        var participants = string.Join(copy.ParticipantSeparator, names.Values.Order(StringComparer.Ordinal));
        var days = messages
            .GroupBy(m => Instant.FromDateTimeOffset(m.SentAt).InZone(zone).Date)
            .Select(day => new TranscriptDay(
                day.Key.ToDateOnly(),
                copy.Date(day.Key.ToDateOnly(), includeWeekday: true),
                day.Select(m => new TranscriptMessage(
                    copy.Timestamp(Instant.FromDateTimeOffset(m.SentAt).InZone(zone)),
                    names.GetValueOrDefault(m.SenderMembershipId, copy.FormerParent),
                    m.Text,
                    m.EventId.HasValue ? copy.LinkedEvent : null)).ToList()))
            .ToList();

        var now = clock.GetUtcNow();
        var generated = Instant.FromDateTimeOffset(now).InZone(zone);
        var today = generated.Date.ToDateOnly();
        var label = range is { From: { } f, To: { } t }
            ? copy.Range(f, t)
            : copy.AllMessages;

        return new TranscriptDocument(
            range is { From: { } a, To: { } b }
                ? string.Create(_english, $"Chat_{a:yyyy-MM-dd}_to_{b:yyyy-MM-dd}.pdf")
                : string.Create(_english, $"Chat_all_messages_{today:yyyy-MM-dd}.pdf"),
            copy.Title,
            label,
            $"{zone.Id} ({TranscriptLabels.UtcOffset(generated.Offset)})",
            participants,
            now,
            copy.Timestamp(generated),
            copy,
            range.From,
            range.To,
            messages.Count,
            days);
    }

    // AtStartOfDay uses the first valid local time. If an entire date was skipped, its boundary is the next day.
    private static DateTimeOffset StartOfDay(DateTimeZone zone, LocalDate date)
    {
        try
        {
            return zone.AtStartOfDay(date).ToInstant().ToDateTimeOffset();
        }
        catch (SkippedTimeException)
        {
            return zone.AtStartOfDay(date.PlusDays(1)).ToInstant().ToDateTimeOffset();
        }
    }
}
