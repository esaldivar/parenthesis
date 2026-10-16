using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Families.Domain;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

internal sealed class FamilyMembershipReader(FamiliesDbContext db) : IFamilyMembershipReader
{
    public async Task<ActiveMembership?> FindActiveAsync(Guid familyId, Guid userId, CancellationToken cancellationToken = default) =>
        // Runs before the tenant is known (it decides the tenant), so it opts out of the tenant filter,
        // constrained to this one user and family.
        await db.Memberships
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .Where(m => m.FamilyId == familyId && m.UserId == userId && m.Status == MembershipStatus.Active)
            .Select(m => new ActiveMembership(m.Id, m.Role))
            .SingleOrDefaultAsync(cancellationToken);
}
