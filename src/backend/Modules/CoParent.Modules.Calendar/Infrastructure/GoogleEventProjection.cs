using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using CoParent.Modules.Calendar.Domain;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>
/// What one parent's Google calendar shows for an event (#386). Only confirmed events are sent, with their confirmed
/// values: a pending change or a proposal never reaches Google, so nothing there looks agreed before it is. Another
/// parent's unavailable time is "Unavailable" with no place or notes, exactly as in Parenthesis.
/// </summary>
internal static class GoogleEventProjection
{
    public const string Footer = "Added by Parenthesis. Change this event in Parenthesis: edits made in Google Calendar are replaced.";

    /// <summary>Google event ids allow 0-9 and a-v; a UUID's 32 hex digits fit, so each event keeps its own id.</summary>
    public static string GoogleId(Guid eventId) => eventId.ToString("N", CultureInfo.InvariantCulture);

    public static bool Sendable(CalendarEvent e) => e.Status == EventStatus.Confirmed;

    public static JsonObject Body(CalendarEvent e, Guid membershipId, string timeZone, Uri? link)
    {
        var hidden = e.Category == EventCategory.Unavailable && e.OwnerMembershipId != membershipId;
        var notes = hidden ? null : e.Notes;
        var body = new JsonObject
        {
            ["summary"] = hidden ? "Unavailable" : e.Title,
            ["description"] = string.IsNullOrWhiteSpace(notes) ? Footer : $"{notes.Trim()}\n\n{Footer}",
            ["start"] = Time(e.StartsAt, e.AllDay, timeZone),
            ["end"] = Time(e.EndsAt, e.AllDay, timeZone),
            ["status"] = "confirmed",
            // Unavailable time and parenting time don't make the parent look busy to people who share their calendar.
            ["transparency"] = e.Category is EventCategory.Unavailable or EventCategory.ParentingTime ? "transparent" : "opaque",
        };
        if (!hidden && !string.IsNullOrWhiteSpace(e.Location))
        {
            body["location"] = e.Location;
        }

        if (link is not null)
        {
            body["source"] = new JsonObject { ["title"] = "Parenthesis", ["url"] = link.ToString() };
        }

        return body;
    }

    /// <summary>A hash of the body, so an unchanged event isn't written again.</summary>
    public static string Hash(JsonObject body) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(body.ToJsonString())));

    /// <summary>
    /// All-day events are stored from local midnight to the local midnight after their last day, which is Google's
    /// exclusive end date. Timed events keep their instant, shown in the family's time zone.
    /// </summary>
    private static JsonObject Time(DateTimeOffset at, bool allDay, string timeZone) => allDay
        ? new JsonObject { ["date"] = EventSchedule.LocalDate(at, timeZone).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) }
        : new JsonObject
        {
            ["dateTime"] = at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
            ["timeZone"] = timeZone,
        };
}
