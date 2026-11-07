namespace CoParent.Modules.Calendar.Contracts;

/// <summary>Where an event stands, as a card in chat shows it: a proposal never reads as confirmed.</summary>
public enum SharedEventStatus
{
    Confirmed,
    /// <summary>Waiting for the other parent's approval.</summary>
    Proposed,
    /// <summary>Declined; still on this parent's calendar until it ends or they remove it.</summary>
    Declined,
}

/// <summary>
/// An event shared in the parents' chat (#125, slice 2), as one parent sees it on their calendar.
/// </summary>
/// <param name="Id">The event.</param>
/// <param name="Title">Its title as this parent sees it: another parent's unavailable time is only "Unavailable".</param>
/// <param name="StartsAt">When it starts.</param>
/// <param name="EndsAt">When it ends.</param>
/// <param name="AllDay">Whether it's an all-day event.</param>
/// <param name="Status">Confirmed, proposed or declined.</param>
/// <param name="ChangePending">A confirmed event with a change waiting for approval.</param>
public sealed record SharedEvent(
    Guid Id,
    string Title,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool AllDay,
    SharedEventStatus Status,
    bool ChangePending);

/// <summary>
/// Reads events for chat cards with the Calendar's own rules for a parent: the same events their calendar and event
/// details show (pending, confirmed, and declined until it ends or they remove it). Cancelled events and events of
/// another family are left out. Scoped to the request's family.
/// </summary>
public interface ISharedEventCards
{
    /// <summary>The events among <paramref name="eventIds"/> that <paramref name="parentMembershipId"/> can see, by id.</summary>
    Task<IReadOnlyDictionary<Guid, SharedEvent>> VisibleToAsync(
        Guid parentMembershipId, IReadOnlyCollection<Guid> eventIds, CancellationToken cancellationToken = default);
}
