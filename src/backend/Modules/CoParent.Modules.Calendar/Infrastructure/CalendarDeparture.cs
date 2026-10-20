using CoParent.Modules.Calendar.Domain;
using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>
/// When a parent deletes their account (A-12): their own "Unavailable" time (whose notes only they could see) is
/// deleted. Shared events stay for the co-parent's history; the departing parent shows as "Former parent". If the
/// family is closing, all its events go.
/// </summary>
internal sealed class CalendarDeparture(CalendarDbContext db) : IParentDepartureHandler
{
    // After approvals, whose withdrawn proposals may already have updated events.
    public int Order => 20;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        var events = departure.FamilyClosing
            ? await db.Events.ToListAsync(cancellationToken)
            : await db.Events
                .Where(e => e.Category == EventCategory.Unavailable && e.OwnerMembershipId == departure.MembershipId)
                .ToListAsync(cancellationToken);

        db.Events.RemoveRange(events);
        await db.SaveChangesAsync(cancellationToken);
    }
}
