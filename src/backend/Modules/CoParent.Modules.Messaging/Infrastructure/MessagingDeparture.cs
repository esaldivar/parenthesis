using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Messaging.Infrastructure;

/// <summary>
/// When a parent deletes their account (A-12): their read position goes, but the messages stay. They're the co-parent's
/// record of the conversation, which can't be edited or deleted (#125); the app shows the sender as a former parent.
/// When the family is closing, nobody is left to read them, so every message goes.
/// </summary>
internal sealed class MessagingDeparture(MessagingDbContext db) : IParentDepartureHandler
{
    public int Order => 40;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(departure);
        db.ReadPositions.RemoveRange(await db.ReadPositions
            .Where(p => departure.FamilyClosing || p.MembershipId == departure.MembershipId)
            .ToListAsync(cancellationToken));
        if (departure.FamilyClosing)
        {
            db.Messages.RemoveRange(await db.Messages.ToListAsync(cancellationToken));
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
