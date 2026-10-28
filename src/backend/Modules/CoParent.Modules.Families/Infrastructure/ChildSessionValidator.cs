using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.SharedKernel.Security;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// A child session stays valid only while the child is active, their sign-in is enabled, and the device is still
/// registered to that family (and, for a paired tablet, to that child). A shared household device's fixed 30-day expiry
/// ends it too (#153). Runs before the tenant is resolved, so it reads
/// across tenants by exact ids.
/// </summary>
internal sealed class ChildSessionValidator(FamiliesDbContext db, TimeProvider clock) : IChildSessionValidator
{
    public async Task<bool> IsValidAsync(ChildSession session, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(session);
        string[] filter = [TenantContext.QueryFilterName];

        var childActive = await db.Children.IgnoreQueryFilters(filter).AnyAsync(
            c => c.Id == session.ChildId && c.FamilyId == session.FamilyId && c.Status == ChildStatus.Active, cancellationToken);
        var accessEnabled = await db.ChildCredentials.IgnoreQueryFilters(filter).AnyAsync(
            c => c.ChildProfileId == session.ChildId, cancellationToken);
        var now = clock.GetUtcNow();
        var device = await db.Devices.IgnoreQueryFilters(filter).SingleOrDefaultAsync(
            d => d.Id == session.DeviceId
                && d.FamilyId == session.FamilyId
                && d.RevokedAt == null
                && (d.ExpiresAt == null || d.ExpiresAt > now)
                && (d.Kind == DeviceKind.Household || d.ChildProfileId == session.ChildId),
            cancellationToken);
        var deviceOk = device is not null
            && (device.Kind == DeviceKind.ChildPaired || await SharedDevices.OwnerAsync(db, device, null, cancellationToken) is not null);
        return childActive && accessEnabled && deviceOk;
    }
}
