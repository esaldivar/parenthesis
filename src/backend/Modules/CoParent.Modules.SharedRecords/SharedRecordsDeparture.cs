using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.SharedRecords;

/// <summary>
/// When a parent deletes their account (A-12): shared funds stay, because they're the co-parent's record too (the app
/// shows the departed parent as a former parent). When the family is closing, nobody is left to read them, so they go.
/// </summary>
internal sealed class SharedRecordsDeparture(SharedRecordsDbContext db) : IParentDepartureHandler
{
    public int Order => 50;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(departure);
        if (!departure.FamilyClosing)
        {
            return;
        }

        db.Funds.RemoveRange(await db.Funds.ToListAsync(cancellationToken));
        await db.SaveChangesAsync(cancellationToken);
    }
}
