using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// Shared family devices and the parent sessions bound to them (#153, ADR-0007). These run before the tenant is known,
/// so they read across tenants by exact ids and token hashes only.
/// </summary>
internal sealed class SharedDevices(
    FamiliesDbContext db, TenantContext tenant, IUnitOfWork unitOfWork, IAuditLog audit, TimeProvider clock) : ISharedDeviceSessions
{
    private static readonly string[] _filter = [TenantContext.QueryFilterName];

    /// <summary>
    /// The usable device this browser's cookie belongs to: not revoked, not expired, and for a shared household device,
    /// still owned by an active parent of the family. Anything else is treated exactly like no device: its picker and
    /// everything it showed are gone.
    /// </summary>
    public static async Task<Device?> FindByCookieAsync(
        HttpContext http, FamiliesDbContext db, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (DeviceCookie.Read(http.Request) is not { } token)
        {
            return null;
        }

        var hash = Device.Hash(token);
        var device = await db.Devices.IgnoreQueryFilters(_filter)
            .SingleOrDefaultAsync(d => d.TokenHash == hash && d.RevokedAt == null, cancellationToken);
        if (device is null || !device.IsUsableAt(now))
        {
            return null;
        }

        return device.Kind == DeviceKind.ChildPaired || await OwnerAsync(db, device, null, cancellationToken) is not null ? device : null;
    }

    /// <summary>The active parent membership that set up this shared device, when it is <paramref name="userId"/>'s.</summary>
    public static Task<FamilyMembership?> OwnerAsync(
        FamiliesDbContext db, Device device, Guid? userId, CancellationToken cancellationToken) =>
        db.Memberships.IgnoreQueryFilters(_filter).SingleOrDefaultAsync(
            m => m.Id == device.CreatedByMembershipId
                && m.FamilyId == device.FamilyId
                && m.Role == FamilyRole.Parent
                && m.Status == MembershipStatus.Active
                && (userId == null || m.UserId == userId),
            cancellationToken);

    public async Task<Guid?> FindForParentAsync(HttpContext http, Guid userId, CancellationToken cancellationToken = default)
    {
        var device = await FindByCookieAsync(http, db, clock.GetUtcNow(), cancellationToken);
        return device is { Kind: DeviceKind.Household } && await OwnerAsync(db, device, userId, cancellationToken) is not null
            ? device.Id
            : null;
    }

    public async Task<bool> IsParentSessionValidAsync(Guid deviceId, Guid userId, CancellationToken cancellationToken = default)
    {
        var device = await db.Devices.IgnoreQueryFilters(_filter).SingleOrDefaultAsync(d => d.Id == deviceId, cancellationToken);
        return device is { Kind: DeviceKind.Household }
            && device.IsUsableAt(clock.GetUtcNow())
            && await OwnerAsync(db, device, userId, cancellationToken) is not null;
    }

    public async Task ForgetOnSignOutAsync(HttpContext http, Guid userId, CancellationToken cancellationToken = default)
    {
        var device = await FindByCookieAsync(http, db, clock.GetUtcNow(), cancellationToken);
        if (device is not { Kind: DeviceKind.Household }
            || await OwnerAsync(db, device, userId, cancellationToken) is not { } owner)
        {
            return;
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            tenant.Resolve(device.FamilyId, owner.Id, FamilyRole.Parent);
            device.Revoke(clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(device.FamilyId, userId, "device.shared_signed_out", "device", device.Id), ct);
        }, cancellationToken);
        DeviceCookie.Delete(http.Response);
    }
}
