using CoParent.SharedKernel.Domain;
using NodaTime;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>
/// A repeating event (#193, C-05): weekly on chosen days, always ending on a date or after a number of times, at most a
/// year after the first. Each date is its own <see cref="CalendarEvent"/> (with <see cref="CalendarEvent.SeriesId"/>),
/// so conflict checks, privacy and the child filter treat it like any other event. Only categories that are confirmed
/// at once can repeat (owner decision, October 22, 2026): unavailable time and activities, never parenting time,
/// holidays or family events.
/// </summary>
internal sealed class CalendarSeries : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public EventCategory Category { get; init; }

    public Guid OwnerMembershipId { get; init; }

    /// <summary>The weekdays it happens on.</summary>
    public WeekDays Days { get; init; }

    /// <summary>Ends on this local date (inclusive), or after <see cref="Count"/> times.</summary>
    public DateOnly? Until { get; init; }

    public int? Count { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public static bool CanRepeat(EventCategory category) => !CalendarEvent.NeedsApproval(category);
}

/// <summary>Weekdays as flags, so a series stores "Wed and Fri" in one column.</summary>
[Flags]
internal enum WeekDays
{
    None = 0,
    Sunday = 1,
    Monday = 2,
    Tuesday = 4,
    Wednesday = 8,
    Thursday = 16,
    Friday = 32,
    Saturday = 64,
}

/// <summary>
/// The dates of a series, in the family's time zone, so "9:00 AM every Wednesday" stays 9:00 AM across daylight-saving
/// changes and an all-day block stays midnight to midnight.
/// </summary>
internal static class EventSchedule
{
    /// <summary>The most dates one series may have: every day for a year.</summary>
    public const int MaxOccurrences = 366;

    public static WeekDays ToFlags(IEnumerable<DayOfWeek> days) =>
        days.Aggregate(WeekDays.None, (all, day) => all | (WeekDays)(1 << (int)day));

    public static IReadOnlyList<DayOfWeek> FromFlags(WeekDays days) =>
        Enum.GetValues<DayOfWeek>().Where(d => days.HasFlag((WeekDays)(1 << (int)d))).ToList();

    /// <summary>The last local date a series starting on <paramref name="first"/> may reach.</summary>
    public static DateOnly LastAllowed(DateOnly first) => first.AddYears(1);

    /// <summary>
    /// Every (start, end) in order: each chosen weekday from the first event's local date, with the first event's
    /// local times, until the end date or count. Stops a year after the first date whatever the end condition, so the
    /// caller can tell when a count doesn't fit.
    /// </summary>
    public static IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> Occurrences(
        DateTimeOffset startsAt, DateTimeOffset endsAt, WeekDays days, DateOnly? until, int? count, string timeZone)
    {
        var zone = DateTimeZoneProviders.Tzdb[timeZone];
        var localStart = Instant.FromDateTimeOffset(startsAt).InZone(zone).LocalDateTime;
        var localEnd = Instant.FromDateTimeOffset(endsAt).InZone(zone).LocalDateTime;
        var spanDays = Period.Between(localStart.Date, localEnd.Date, PeriodUnits.Days).Days;
        var firstDate = ToDateOnly(localStart.Date);
        var last = until is { } end && end < LastAllowed(firstDate) ? end : LastAllowed(firstDate);
        var limit = Math.Min(count ?? MaxOccurrences, MaxOccurrences);

        var result = new List<(DateTimeOffset, DateTimeOffset)>();
        for (var date = localStart.Date; ToDateOnly(date) <= last && result.Count < limit; date = date.PlusDays(1))
        {
            if (!days.HasFlag((WeekDays)(1 << (int)ToDayOfWeek(date.DayOfWeek))))
            {
                continue;
            }

            var start = date.At(localStart.TimeOfDay).InZoneLeniently(zone).ToDateTimeOffset().ToUniversalTime();
            var finish = date.PlusDays(spanDays).At(localEnd.TimeOfDay).InZoneLeniently(zone).ToDateTimeOffset().ToUniversalTime();
            result.Add((start, finish));
        }

        return result;
    }

    /// <summary>The same date with a new local time span: how a series edit moves one occurrence.</summary>
    public static (DateTimeOffset Start, DateTimeOffset End) Retime(
        DateTimeOffset occurrenceStart, DateTimeOffset newStart, DateTimeOffset newEnd, string timeZone)
    {
        var zone = DateTimeZoneProviders.Tzdb[timeZone];
        var date = Instant.FromDateTimeOffset(occurrenceStart).InZone(zone).Date;
        var localStart = Instant.FromDateTimeOffset(newStart).InZone(zone).LocalDateTime;
        var localEnd = Instant.FromDateTimeOffset(newEnd).InZone(zone).LocalDateTime;
        var spanDays = Period.Between(localStart.Date, localEnd.Date, PeriodUnits.Days).Days;
        return (
            date.At(localStart.TimeOfDay).InZoneLeniently(zone).ToDateTimeOffset().ToUniversalTime(),
            date.PlusDays(spanDays).At(localEnd.TimeOfDay).InZoneLeniently(zone).ToDateTimeOffset().ToUniversalTime());
    }

    public static DateOnly LocalDate(DateTimeOffset moment, string timeZone) =>
        ToDateOnly(Instant.FromDateTimeOffset(moment).InZone(DateTimeZoneProviders.Tzdb[timeZone]).Date);

    private static DateOnly ToDateOnly(LocalDate date) => new(date.Year, date.Month, date.Day);

    private static DayOfWeek ToDayOfWeek(IsoDayOfWeek day) => day == IsoDayOfWeek.Sunday ? DayOfWeek.Sunday : (DayOfWeek)(int)day;
}
