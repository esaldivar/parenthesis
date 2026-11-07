using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

internal sealed class FamilyRoster(FamiliesDbContext db, IUserDirectory directory) : IFamilyRoster
{
    public async Task<IReadOnlySet<Guid>> ActiveChildIdsAsync(CancellationToken cancellationToken = default) =>
        (await db.Children.Where(c => c.Status == ChildStatus.Active).Select(c => c.Id).ToListAsync(cancellationToken)).ToHashSet();

    public async Task<IReadOnlySet<Guid>> ActiveParentMembershipIdsAsync(CancellationToken cancellationToken = default) =>
        (await db.Memberships
            .Where(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
            .Select(m => m.Id)
            .ToListAsync(cancellationToken)).ToHashSet();

    public async Task<IReadOnlyDictionary<Guid, string>> ActiveParentNamesAsync(CancellationToken cancellationToken = default)
    {
        var parents = await db.Memberships
            .Where(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
            .Select(m => new { m.Id, m.UserId })
            .ToListAsync(cancellationToken);
        var names = await directory.GetDisplayNamesAsync(parents.Select(p => p.UserId).ToList(), cancellationToken);
        return parents.Where(p => names.ContainsKey(p.UserId)).ToDictionary(p => p.Id, p => names[p.UserId]);
    }

    public async Task<string> TimeZoneAsync(CancellationToken cancellationToken = default) =>
        await db.Families.Select(f => f.TimeZone).SingleAsync(cancellationToken);
}
