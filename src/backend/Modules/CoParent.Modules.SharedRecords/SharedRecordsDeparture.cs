using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.SharedRecords;

/// <summary>
/// When a parent deletes their account (A-12): shared funds stay, because they're the co-parent's record too (the app
/// shows the departed parent as a former parent). When the family is closing, nobody is left to read them, so they go,
/// with every report and attachment (files are deleted by <see cref="AttachmentCleanup"/> after the closure commits).
/// </summary>
internal sealed class SharedRecordsDeparture(SharedRecordsDbContext db, TimeProvider clock) : IParentDepartureHandler
{
    public int Order => 50;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(departure);
        if (!departure.FamilyClosing)
        {
            return;
        }

        // Reports are only marked removed here, inside the closing transaction: their files are deleted by the cleanup
        // once the closure has committed, so a rolled-back closure never loses a file, and none is left behind.
        var now = clock.GetUtcNow();
        foreach (var entry in await db.Entries.ToListAsync(cancellationToken))
        {
            entry.RemovedAt = now;
        }

        db.SupportRecords.RemoveRange(await db.SupportRecords.ToListAsync(cancellationToken));
        db.Funds.RemoveRange(await db.Funds.ToListAsync(cancellationToken));
        await db.SaveChangesAsync(cancellationToken);
    }
}
