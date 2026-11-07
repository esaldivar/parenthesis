using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Endpoints;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Chat cards (#125) through the calendar's tenant-filtered context and its own visibility rules.</summary>
internal sealed class SharedEventCards(CalendarDbContext db, TimeProvider clock) : ISharedEventCards
{
    public async Task<IReadOnlyDictionary<Guid, SharedEvent>> VisibleToAsync(
        Guid parentMembershipId, IReadOnlyCollection<Guid> eventIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventIds);
        if (eventIds.Count == 0)
        {
            return new Dictionary<Guid, SharedEvent>();
        }

        var events = await CalendarEndpoints.DeclinedStillShown(db.Events, db, parentMembershipId, clock.GetUtcNow())
            .AsNoTracking()
            .Where(e => eventIds.Contains(e.Id))
            .Select(e => new { e.Id, e.Title, e.StartsAt, e.EndsAt, e.AllDay, e.Status, e.Category, e.OwnerMembershipId, e.PendingChange })
            .ToListAsync(cancellationToken);

        return events.ToDictionary(
            e => e.Id,
            e => new SharedEvent(
                e.Id,
                e.Category == EventCategory.Unavailable && e.OwnerMembershipId != parentMembershipId ? CalendarEndpoints.UnavailableTitle : e.Title,
                e.StartsAt,
                e.EndsAt,
                e.AllDay,
                e.Status switch
                {
                    EventStatus.PendingApproval => SharedEventStatus.Proposed,
                    EventStatus.Rejected => SharedEventStatus.Declined,
                    _ => SharedEventStatus.Confirmed,
                },
                ChangePending: e.Status == EventStatus.Confirmed && e.PendingChange != PendingChange.None));
    }
}
