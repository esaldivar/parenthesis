using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Calendar.Domain;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Events for the Memories module (#403), through the calendar's own tenant-filtered context.</summary>
internal sealed class EventPhotoCalendar(CalendarDbContext db) : IEventPhotoCalendar
{
    public async Task<PhotoEvent?> FindAsync(Guid eventId, CancellationToken cancellationToken = default) =>
        (await FindManyAsync([eventId], cancellationToken)).GetValueOrDefault(eventId);

    public async Task<IReadOnlyDictionary<Guid, PhotoEvent>> FindManyAsync(
        IReadOnlyCollection<Guid> eventIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventIds);
        if (eventIds.Count == 0)
        {
            return new Dictionary<Guid, PhotoEvent>();
        }

        var events = await db.Events
            .AsNoTracking()
            .Where(e => eventIds.Contains(e.Id))
            .Select(e => new { e.Id, e.Title, e.StartsAt, e.EndsAt, e.AllDay, e.Status, e.Category, e.CaregiverMembershipId })
            .ToListAsync(cancellationToken);

        return events.ToDictionary(
            e => e.Id,
            e => new PhotoEvent(
                e.Id,
                e.Title,
                e.StartsAt,
                e.EndsAt,
                e.AllDay,
                IsConfirmed: e.Status == EventStatus.Confirmed,
                IsCancelled: e.Status == EventStatus.Cancelled,
                IsParentingTime: e.Category == EventCategory.ParentingTime,
                IsUnavailable: e.Category == EventCategory.Unavailable,
                e.CaregiverMembershipId));
    }
}
