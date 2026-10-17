using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

internal sealed class FamilyRoster(FamiliesDbContext db) : IFamilyRoster
{
    public async Task<IReadOnlySet<Guid>> ActiveChildIdsAsync(CancellationToken cancellationToken = default) =>
        (await db.Children.Where(c => c.Status == ChildStatus.Active).Select(c => c.Id).ToListAsync(cancellationToken)).ToHashSet();

    public async Task<IReadOnlySet<Guid>> ActiveParentMembershipIdsAsync(CancellationToken cancellationToken = default) =>
        (await db.Memberships
            .Where(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
            .Select(m => m.Id)
            .ToListAsync(cancellationToken)).ToHashSet();
}
