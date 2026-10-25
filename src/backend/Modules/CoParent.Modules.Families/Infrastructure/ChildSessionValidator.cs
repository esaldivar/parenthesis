using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.SharedKernel.Security;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// A child session stays valid only while the child is active, their sign-in is enabled, and the device is still
/// registered to that family (and, for a paired tablet, to that child). Runs before the tenant is resolved, so it reads
/// across tenants by exact ids.
/// </summary>
internal sealed class ChildSessionValidator(FamiliesDbContext db) : IChildSessionValidator
{
    public async Task<bool> IsValidAsync(ChildSession session, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(session);
        string[] filter = [TenantContext.QueryFilterName];

        var childActive = await db.Children.IgnoreQueryFilters(filter).AnyAsync(
            c => c.Id == session.ChildId && c.FamilyId == session.FamilyId && c.Status == ChildStatus.Active, cancellationToken);
        var accessEnabled = await db.ChildCredentials.IgnoreQueryFilters(filter).AnyAsync(
            c => c.ChildProfileId == session.ChildId, cancellationToken);
        var deviceOk = await db.Devices.IgnoreQueryFilters(filter).AnyAsync(
            d => d.Id == session.DeviceId
                && d.FamilyId == session.FamilyId
                && d.RevokedAt == null
                && (d.Kind == DeviceKind.Household || d.ChildProfileId == session.ChildId),
            cancellationToken);
        return childActive && accessEnabled && deviceOk;
    }
}
