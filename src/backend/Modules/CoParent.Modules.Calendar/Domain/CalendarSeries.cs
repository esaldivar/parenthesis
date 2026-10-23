using CoParent.SharedKernel.Domain;
using NodaTime;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>
/// A repeating event (#193, C-05): every N days, every N weeks on chosen days, or every N months on the same date (#238),
/// always ending on a date or after a number of times, at most a year after the first. Each date is its own <see cref="CalendarEvent"/> (with <see cref="CalendarEvent.SeriesId"/>),
/// so conflict checks, privacy and the child filter treat it like any other event. See <see cref="CanRepeat"/> for
/// which categories repeat.
/// </summary>
internal sealed class CalendarSeries : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public EventCategory Category { get; init; }

    public Guid OwnerMembershipId { get; init; }

    /// <summary>How often it repeats (#238). Series made before that are weekly.</summary>
    public SeriesFrequency Frequency { get; init; } = SeriesFrequency.Weekly;

    /// <summary>Every this many days, weeks or months (1 is every one).</summary>
    public int Interval { get; init; } = 1;

    /// <summary>The weekdays a weekly series happens on; none for daily or monthly.</summary>
    public WeekDays Days { get; init; }

    /// <summary>Ends on this local date (inclusive), or after <see cref="Count"/> times.</summary>
    public DateOnly? Until { get; init; }

    public int? Count { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>
    /// Unavailable time and activities, confirmed at once, and parenting time, which waits for one approval of the whole
    /// series (#239, owner decision October 23, 2026). Holidays and family events don't repeat yet.
    /// </summary>
    public static bool CanRepeat(EventCategory category) =>
        !CalendarEvent.NeedsApproval(category) || category == EventCategory.ParentingTime;
}

/// <summary>How often a series repeats (#238, owner decision October 23, 2026; no yearly for now).</summary>
internal enum SeriesFrequency
{
    Weekly,
    Daily,
    Monthly,
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

    /// <summary>The largest "every N" for each frequency: a month of days, half a year of weeks, a year of months.</summary>
    public static int MaxInterval(SeriesFrequency frequency) => frequency switch
    {
        SeriesFrequency.Daily => 30,
        SeriesFrequency.Weekly => 26,
        _ => 12,
    };

    /// <summary>The last local date a series starting on <paramref name="first"/> may reach.</summary>
    public static DateOnly LastAllowed(DateOnly first) => first.AddYears(1);

    /// <summary>
    /// Every (start, end) in order, with the first event's local times, until the end date or count:
    /// <list type="bullet">
    /// <item>Daily: every <paramref name="interval"/> days from the first date.</item>
    /// <item>Weekly: each chosen weekday, in every <paramref name="interval"/>th week (Sunday to Saturday) from the first.</item>
    /// <item>Monthly: the first date's day of the month, every <paramref name="interval"/> months; a month without that
    /// day (the 31st in April) is skipped, as Google Calendar does.</item>
    /// </list>
    /// Stops a year after the first date whatever the end condition, so the caller can tell when a count doesn't fit.
    /// </summary>
    public static IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> Occurrences(
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        WeekDays days,
        DateOnly? until,
        int? count,
        string timeZone,
        SeriesFrequency frequency = SeriesFrequency.Weekly,
        int interval = 1)
    {
        var zone = DateTimeZoneProviders.Tzdb[timeZone];
        var localStart = Instant.FromDateTimeOffset(startsAt).InZone(zone).LocalDateTime;
        var localEnd = Instant.FromDateTimeOffset(endsAt).InZone(zone).LocalDateTime;
        var spanDays = Period.Between(localStart.Date, localEnd.Date, PeriodUnits.Days).Days;
        var firstDate = ToDateOnly(localStart.Date);
        var last = until is { } end && end < LastAllowed(firstDate) ? end : LastAllowed(firstDate);
        var limit = Math.Min(count ?? MaxOccurrences, MaxOccurrences);

        var result = new List<(DateTimeOffset, DateTimeOffset)>();
        var firstWeek = WeekStart(localStart.Date);
        for (var date = localStart.Date; ToDateOnly(date) <= last && result.Count < limit; date = date.PlusDays(1))
        {
            var happens = frequency switch
            {
                SeriesFrequency.Daily => Period.Between(localStart.Date, date, PeriodUnits.Days).Days % interval == 0,
                SeriesFrequency.Monthly => date.Day == localStart.Date.Day
                    && Period.Between(localStart.Date, date, PeriodUnits.Months).Months % interval == 0,
                _ => days.HasFlag((WeekDays)(1 << (int)ToDayOfWeek(date.DayOfWeek)))
                    && Period.Between(firstWeek, WeekStart(date), PeriodUnits.Days).Days / 7 % interval == 0,
            };
            if (!happens)
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

    /// <summary>The Sunday that starts the week containing <paramref name="date"/>.</summary>
    private static LocalDate WeekStart(LocalDate date) => date.PlusDays(-((int)ToDayOfWeek(date.DayOfWeek)));

    private static DayOfWeek ToDayOfWeek(IsoDayOfWeek day) => day == IsoDayOfWeek.Sunday ? DayOfWeek.Sunday : (DayOfWeek)(int)day;
}
