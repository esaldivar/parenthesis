namespace CoParent.Modules.Calendar.Contracts;

/// <summary>
/// What the Memories module needs to know about an event for photos (#403). Pending, declined and cancelled events are
/// returned too, so Memories can explain why photos can't be added and keep showing photos added before a cancel.
/// </summary>
/// <param name="Id">The event.</param>
/// <param name="Title">Its title, as both parents see it.</param>
/// <param name="StartsAt">When it starts.</param>
/// <param name="EndsAt">When it ends.</param>
/// <param name="AllDay">Whether it's an all-day event.</param>
/// <param name="IsConfirmed">Confirmed, including "Confirmed · change pending".</param>
/// <param name="IsCancelled">Cancelled after being confirmed.</param>
/// <param name="IsParentingTime">Only the designated caregiver may add photos.</param>
/// <param name="IsUnavailable">A parent's own unavailable time: never takes photos.</param>
/// <param name="CaregiverMembershipId">Parenting time only: the parent who has the children.</param>
public sealed record PhotoEvent(
    Guid Id,
    string Title,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool AllDay,
    bool IsConfirmed,
    bool IsCancelled,
    bool IsParentingTime,
    bool IsUnavailable,
    Guid? CaregiverMembershipId);

/// <summary>Reads events for photos, scoped to the request's family (#403).</summary>
public interface IEventPhotoCalendar
{
    /// <summary>The event, or null when the family has no such event.</summary>
    Task<PhotoEvent?> FindAsync(Guid eventId, CancellationToken cancellationToken = default);

    /// <summary>The family's events among <paramref name="eventIds"/>, by id. Unknown ids are left out.</summary>
    Task<IReadOnlyDictionary<Guid, PhotoEvent>> FindManyAsync(IReadOnlyCollection<Guid> eventIds, CancellationToken cancellationToken = default);
}
