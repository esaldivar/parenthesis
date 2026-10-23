using CoParent.Modules.Calendar.Domain;

namespace CoParent.Modules.Calendar;

/// <summary>
/// "Today" for the rule that new calendar dates start from today (#232, owner decisions October 23, 2026), in the
/// family's time zone. Earlier times today are fine; only past days are refused. Its own service so tests can fix the
/// day their dates are checked against, while everything else keeps the real clock.
/// </summary>
public class CalendarToday(TimeProvider clock)
{
    /// <summary>The refusal for a start date before today.</summary>
    public const string PastStart = "Choose a start date from today on.";

    /// <summary>The refusal for a reminder date or due date before today.</summary>
    public const string PastDate = "Choose a date from today on.";

    /// <summary>The moment the check is made.</summary>
    public virtual DateTimeOffset UtcNow => clock.GetUtcNow();

    /// <summary>Today's date in the family's time zone.</summary>
    public DateOnly In(string timeZone) => EventSchedule.LocalDate(UtcNow, timeZone);
}
