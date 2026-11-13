using CoParent.Modules.Calendar.Domain;

namespace CoParent.Modules.Calendar;

/// <summary>
/// "Today" for the rule that new calendar dates start from today (#232, owner decisions October 23, 2026), in the
/// family's time zone. Earlier times today are fine; only past days are refused. It reads the clock registered under
/// <see cref="CalendarModule.TodayClock"/>, so tests can fix the day while the rest of the app keeps the real time.
/// </summary>
internal static class CalendarToday
{
    /// <summary>The refusal for a start date before today.</summary>
    public const string PastStart = "Choose a start date from today on.";

    /// <summary>The refusal for an end date moved to a day before today.</summary>
    public const string PastEnd = "Choose an end date from today on.";

    /// <summary>The refusal for a reminder date or due date before today.</summary>
    public const string PastDate = "Choose a date from today on.";

    /// <summary>Today's date in the family's time zone.</summary>
    public static DateOnly In(this TimeProvider today, string timeZone) => EventSchedule.LocalDate(today.GetUtcNow(), timeZone);
}
