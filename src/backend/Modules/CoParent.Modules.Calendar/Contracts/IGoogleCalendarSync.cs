namespace CoParent.Modules.Calendar.Contracts;

/// <summary>
/// One pass of copying confirmed family events to connected parents' Google Calendars (#386). A background worker
/// runs it on a timer; tests run it directly.
/// </summary>
public interface IGoogleCalendarSync
{
    /// <summary>Returns how many Google writes (creates, updates and deletes) the pass made.</summary>
    Task<int> SyncAsync(CancellationToken cancellationToken = default);
}
