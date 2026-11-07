using System.Globalization;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Messaging.Infrastructure;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using NodaTime;

namespace CoParent.Modules.Messaging.Transcripts;

/// <summary>One message in a transcript: its family-local time, who sent it, and what it said.</summary>
internal sealed record TranscriptMessage(string Time, string Sender, bool Yours, string Text, string? Event);

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
    string PreparedFor,
    DateTimeOffset PreparedAt,
    string PreparedLabel,
    DateOnly? From,
    DateOnly? To,
    int MessageCount,
    IReadOnlyList<TranscriptDay> Days);

/// <summary>Which messages a transcript holds: all of them, or the family-local dates from and to, both included.</summary>
internal readonly record struct TranscriptRange(DateOnly? From, DateOnly? To)
{
    public bool All => From is null;

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
/// midnight on the start date up to local midnight after the end date. Shared events are described as the requesting
/// parent's calendar shows them, and a parent who left is "Former parent".
/// </summary>
internal sealed class TranscriptBuilder(MessagingDbContext db, IFamilyRoster roster, ISharedEventCards cards, TimeProvider clock)
{
    /// <summary>The most messages one transcript holds; a longer range has to be split.</summary>
    public const int MaxMessages = 5000;

    // The API runs in invariant globalization mode; the invariant culture uses English month and day names.
    private static readonly CultureInfo _english = CultureInfo.InvariantCulture;

    /// <summary>The transcript, or null when the range holds more than <see cref="MaxMessages"/> messages.</summary>
    public async Task<TranscriptDocument?> BuildAsync(ITenantContext tenant, TranscriptRange range, CancellationToken ct)
    {
        var timeZoneId = await roster.TimeZoneAsync(ct);
        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZoneId) ?? DateTimeZone.Utc;

        var query = db.Messages.AsNoTracking();
        if (range is { From: { } from, To: { } to })
        {
            // PostgreSQL timestamptz takes UTC only.
            var start = zone.AtStartOfDay(LocalDate.FromDateOnly(from)).ToInstant().ToDateTimeOffset();
            var end = zone.AtStartOfDay(LocalDate.FromDateOnly(to).PlusDays(1)).ToInstant().ToDateTimeOffset();
            query = query.Where(m => m.SentAt >= start && m.SentAt < end);
        }

        if (await query.CountAsync(ct) > MaxMessages)
        {
            return null;
        }

        var messages = await query.OrderBy(m => m.Sequence).ToListAsync(ct);
        var names = await roster.ActiveParentNamesAsync(ct);
        var eventIds = messages.Where(m => m.EventId is not null).Select(m => m.EventId!.Value).Distinct().ToList();
        var events = eventIds.Count == 0 ? new Dictionary<Guid, SharedEvent>() : await cards.VisibleToAsync(tenant.MembershipId, eventIds, ct);

        var you = names.GetValueOrDefault(tenant.MembershipId, "You");
        var coParent = names.Where(n => n.Key != tenant.MembershipId).Select(n => n.Value).FirstOrDefault();
        LocalDate Local(DateTimeOffset at) => Instant.FromDateTimeOffset(at).InZone(zone).Date;

        var days = messages
            .GroupBy(m => Local(m.SentAt))
            .Select(day => new TranscriptDay(
                day.Key.ToDateOnly(),
                day.Key.ToDateOnly().ToString("dddd, MMMM d, yyyy", _english),
                day.Select(m => new TranscriptMessage(
                    Instant.FromDateTimeOffset(m.SentAt).InZone(zone).TimeOfDay.ToString("h:mm tt", _english),
                    names.GetValueOrDefault(m.SenderMembershipId, "Former parent"),
                    m.SenderMembershipId == tenant.MembershipId,
                    m.Text,
                    m.EventId is { } id ? Describe(events.GetValueOrDefault(id), zone) : null)).ToList()))
            .ToList();

        var now = clock.GetUtcNow();
        var today = Local(now).ToDateOnly();
        var firstDay = days.FirstOrDefault()?.Date;
        var lastDay = days.LastOrDefault()?.Date;
        var label = range is { From: { } f, To: { } t }
            ? DateRange(f, t)
            : firstDay is { } first && lastDay is { } last ? DateRange(first, last) : "No messages yet";

        return new TranscriptDocument(
            range is { From: { } a, To: { } b }
                ? string.Create(_english, $"Chat_{a:yyyy-MM-dd}_to_{b:yyyy-MM-dd}.pdf")
                : string.Create(_english, $"Chat_all_messages_{today:yyyy-MM-dd}.pdf"),
            coParent is null ? "Chat transcript" : $"Chat with {coParent}",
            range.All ? $"All messages · {label}" : label,
            timeZoneId,
            you,
            now,
            $"Prepared for {you} on {today.ToString("MMMM d, yyyy", _english)}. Times are in {timeZoneId}.",
            range.From,
            range.To,
            messages.Count,
            days);
    }

    /// <summary>"Nov 1–6, 2026", "Oct 28 – Nov 6, 2026", "Dec 30, 2025 – Jan 2, 2026" or "Nov 6, 2026".</summary>
    public static string DateRange(DateOnly from, DateOnly to)
    {
        if (from == to)
        {
            return from.ToString("MMM d, yyyy", _english);
        }

        if (from.Year != to.Year)
        {
            return $"{from.ToString("MMM d, yyyy", _english)} – {to.ToString("MMM d, yyyy", _english)}";
        }

        return from.Month == to.Month
            ? $"{from.ToString("MMM d", _english)}–{to.ToString("d, yyyy", _english)}"
            : $"{from.ToString("MMM d", _english)} – {to.ToString("MMM d, yyyy", _english)}";
    }

    /// <summary>A shared event as this parent's calendar shows it; a proposal never reads as confirmed.</summary>
    private static string Describe(SharedEvent? shared, DateTimeZone zone)
    {
        if (shared is null)
        {
            return "Shared a calendar event that is no longer on the calendar";
        }

        var start = Instant.FromDateTimeOffset(shared.StartsAt).InZone(zone);
        var when = shared.AllDay
            ? $"{start.Date.ToDateOnly().ToString("ddd, MMM d, yyyy", _english)}, all day"
            : $"{start.Date.ToDateOnly().ToString("ddd, MMM d, yyyy", _english)}, {start.TimeOfDay.ToString("h:mm tt", _english)}";
        var status = shared.Status switch
        {
            SharedEventStatus.Proposed => " (pending approval)",
            SharedEventStatus.Declined => " (declined)",
            _ => shared.ChangePending ? " (change pending)" : "",
        };
        return $"Shared a calendar event: {shared.Title}, {when}{status}";
    }
}
