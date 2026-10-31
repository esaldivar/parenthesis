using CoParent.Modules.Memories.Domain;
using CoParent.SharedKernel.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// When a parent deletes their account (A-12): their event photos are deleted for everyone (including batches they had
/// shared) and their Memories settings go. The cleanup then removes the files. If the family is closing, every photo
/// goes. The co-parent's own photos stay.
/// </summary>
internal sealed class MemoriesDeparture(MemoriesDbContext db, TimeProvider clock) : IParentDepartureHandler
{
    public int Order => 30;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(departure);
        var now = clock.GetUtcNow();
        var photos = await db.Photos
            .Where(p => (departure.FamilyClosing || p.UploaderMembershipId == departure.MembershipId)
                && (p.State == PhotoState.Active || p.State == PhotoState.Uploading))
            .ToListAsync(cancellationToken);
        foreach (var photo in photos)
        {
            photo.State = PhotoState.Deleted;
            photo.RemovedAt = now;
        }

        db.Settings.RemoveRange(await db.Settings
            .Where(s => departure.FamilyClosing || s.MembershipId == departure.MembershipId)
            .ToListAsync(cancellationToken));
        await db.SaveChangesAsync(cancellationToken);
    }
}
