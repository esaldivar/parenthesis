using CoParent.Modules.Calendar.Domain;
using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>
/// When a parent deletes their account (A-12): their own "Unavailable" time (whose notes only they could see) is
/// deleted, along with their reminder and task Seen marks. Shared events, reminders and tasks stay for the co-parent's
/// history; the departing parent shows as "Former parent". If the family is closing, all of them go.
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

        // Reminders are shared, so they stay (the departing parent shows as "Former parent"). Only their own Seen
        // marks go. A closing family loses everything.
        db.ReminderSeen.RemoveRange(departure.FamilyClosing
            ? await db.ReminderSeen.ToListAsync(cancellationToken)
            : await db.ReminderSeen.Where(s => s.MembershipId == departure.MembershipId).ToListAsync(cancellationToken));
        db.TaskSeen.RemoveRange(departure.FamilyClosing
            ? await db.TaskSeen.ToListAsync(cancellationToken)
            : await db.TaskSeen.Where(s => s.MembershipId == departure.MembershipId).ToListAsync(cancellationToken));
        if (departure.FamilyClosing)
        {
            db.TaskHistory.RemoveRange(await db.TaskHistory.ToListAsync(cancellationToken));
            db.TaskItems.RemoveRange(await db.TaskItems.ToListAsync(cancellationToken));
            db.Tasks.RemoveRange(await db.Tasks.ToListAsync(cancellationToken));
            db.ReminderHistory.RemoveRange(await db.ReminderHistory.ToListAsync(cancellationToken));
            db.Reminders.RemoveRange(await db.Reminders.ToListAsync(cancellationToken));
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
