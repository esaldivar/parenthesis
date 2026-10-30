using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Calendar.Domain;

internal enum GoogleConnectionStatus
{
    /// <summary>Events are being copied to the parent's Google calendar.</summary>
    Active,

    /// <summary>Copying stopped (see <see cref="GoogleConnectionProblem"/>); the parent reconnects or disconnects.</summary>
    NeedsReconnect,
}

/// <summary>Why copying stopped. Only a code: Google's own error text is never stored.</summary>
internal enum GoogleConnectionProblem
{
    None,

    /// <summary>The parent removed Parenthesis's access in their Google account, or Google expired it.</summary>
    AccessRevoked,

    /// <summary>The parent deleted the "Parenthesis Family" calendar in Google Calendar.</summary>
    CalendarRemoved,
}

/// <summary>
/// One parent's one-way copy of their family's calendar to their own Google Calendar (#386). Per parent, per family:
/// it never changes what the co-parent or the children see. The refresh token is encrypted with ASP.NET Core data
/// protection and is never logged, returned to a browser or put in telemetry.
/// </summary>
internal sealed class GoogleCalendarConnection : Entity, IFamilyScoped
{
    public const int CalendarIdMaxLength = 255;

    public Guid FamilyId { get; init; }

    public Guid MembershipId { get; init; }

    /// <summary>The refresh token, encrypted (data protection purpose <c>GoogleCalendarTokens.Purpose</c>).</summary>
    public required string ProtectedRefreshToken { get; set; }

    /// <summary>The id of the secondary calendar Parenthesis created in the parent's Google account.</summary>
    public required string GoogleCalendarId { get; set; }

    public GoogleConnectionStatus Status { get; set; }

    public GoogleConnectionProblem Problem { get; set; }

    public DateTimeOffset ConnectedAt { get; set; }

    public DateTimeOffset? LastSyncedAt { get; set; }

    public void Stop(GoogleConnectionProblem problem) => (Status, Problem) = (GoogleConnectionStatus.NeedsReconnect, problem);
}

/// <summary>
/// An event Parenthesis has written to a connection's Google calendar, and a hash of what was written, so an
/// unchanged event isn't sent again. The Google event id is the Parenthesis event id, so no id is stored.
/// </summary>
internal sealed class GoogleSyncedEvent : IFamilyScoped
{
    public const int HashLength = 64;

    public Guid FamilyId { get; init; }

    public Guid ConnectionId { get; init; }

    public Guid EventId { get; init; }

    public required string Hash { get; set; }
}
