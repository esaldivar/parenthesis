namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>
/// Copying the family calendar to parents' Google Calendars (#386), configured under <c>GoogleCalendar</c>. Without a
/// client id and secret the feature is off: Settings says it isn't available and nothing calls Google.
/// </summary>
internal sealed class GoogleCalendarOptions
{
    public const string Section = "GoogleCalendar";

    /// <summary>
    /// The only scope requested: Parenthesis may make secondary calendars and manage those, and nothing else. It can't
    /// see the parent's other calendars or their events.
    /// </summary>
    public const string Scope = "https://www.googleapis.com/auth/calendar.app.created";

    /// <summary>Where Google sends the parent back to, under <c>App:PublicBaseUrl</c>. Registered in Google Cloud.</summary>
    public const string CallbackPath = "/settings/google-calendar";

    /// <summary>The OAuth web client id from Google Cloud.</summary>
    public string? ClientId { get; set; }

    /// <summary>The OAuth client secret. Key Vault in Azure, user-secrets locally; never in the repository.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Lets an environment switch the feature off while keeping its client.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>The name of the calendar created in each parent's Google account.</summary>
    public string CalendarName { get; set; } = "Parenthesis Family";

    /// <summary>How often confirmed changes are copied, at most. Connecting also starts a copy straight away.</summary>
    public TimeSpan SyncInterval { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>Events that ended longer ago than this aren't sent (or removed) any more; Google keeps what it has.</summary>
    public TimeSpan PastWindow { get; set; } = TimeSpan.FromDays(30);

    /// <summary>Events starting further ahead than this are sent once they come into range.</summary>
    public TimeSpan FutureWindow { get; set; } = TimeSpan.FromDays(400);

    /// <summary>
    /// The most Google writes for one parent in one pass, well under Google's per-user rate limit. A first copy of a
    /// busy calendar finishes over a few passes.
    /// </summary>
    public int MaxWritesPerPass { get; set; } = 200;

    /// <summary>Whether the background worker copies events. Tests turn it off and run passes themselves.</summary>
    public bool BackgroundSync { get; set; } = true;

    public bool IsOn => Enabled && !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
