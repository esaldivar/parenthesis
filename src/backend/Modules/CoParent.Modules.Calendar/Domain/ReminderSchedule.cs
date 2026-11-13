using NodaTime;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>
/// When a repeating reminder happens, in the family's time zone, so "8:00 AM every Monday" stays 8:00 AM across
/// daylight-saving changes. Each occurrence is counted from the first one, so a monthly reminder on the 31st falls on
/// the last day of shorter months (Feb 28, Apr 30) and is back on the 31st when the month has one.
/// </summary>
internal static class ReminderSchedule
{
    /// <summary>The most occurrences a series may have (also caps a repeat-until date).</summary>
    public const int MaxOccurrences = 366;

    /// <summary>The furthest a repeat-until date may be from the start.</summary>
    public const int MaxYears = 2;

    /// <summary>Every occurrence's start, in order. One-off reminders have one.</summary>
    public static IEnumerable<DateTimeOffset> Occurrences(
        DateTimeOffset startsAt, RepeatFrequency repeat, DateOnly? until, int? count, string timeZone)
    {
        if (repeat == RepeatFrequency.None)
        {
            yield return startsAt;
            yield break;
        }

        var zone = DateTimeZoneProviders.Tzdb[timeZone];
        var first = Instant.FromDateTimeOffset(startsAt).InZone(zone).LocalDateTime;
        var last = until is { } end ? new LocalDate(end.Year, end.Month, end.Day) : (LocalDate?)null;
        var limit = Math.Min(count ?? MaxOccurrences, MaxOccurrences);
        for (var i = 0; i < limit; i++)
        {
            var local = repeat switch
            {
                RepeatFrequency.Daily => first.PlusDays(i),
                RepeatFrequency.Weekly => first.PlusWeeks(i),
                _ => first.PlusMonths(i),
            };
            if (last is { } stop && local.Date > stop)
            {
                yield break;
            }

            yield return local.InZoneLeniently(zone).ToDateTimeOffset().ToUniversalTime();
        }
    }

    /// <summary>The occurrences that start in [from, to).</summary>
    public static IEnumerable<DateTimeOffset> Between(Reminder reminder, string timeZone, DateTimeOffset from, DateTimeOffset to) =>
        Occurrences(reminder.StartsAt, reminder.Repeat, reminder.RepeatUntil, reminder.RepeatCount, timeZone)
            .SkipWhile(o => o < from)
            .TakeWhile(o => o < to);

    /// <summary>The family-local date a moment falls on.</summary>
    public static DateOnly LocalDate(DateTimeOffset moment, string timeZone)
    {
        var date = Instant.FromDateTimeOffset(moment).InZone(DateTimeZoneProviders.Tzdb[timeZone]).Date;
        return new DateOnly(date.Year, date.Month, date.Day);
    }
}
