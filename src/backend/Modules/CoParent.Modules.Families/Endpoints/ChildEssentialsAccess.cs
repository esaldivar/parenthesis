using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal static class ChildEssentialsAccess
{
    public static async Task<bool> LockActiveParentAsync(
        FamiliesDbContext db, ITenantContext tenant, Guid userId, CancellationToken ct)
    {
        // Serialize section edits with invitation acceptance and account deletion.
        var locked = await db.Database.SqlQuery<int>(
            $"SELECT 1 AS \"Value\" FROM families.families WHERE id = {tenant.FamilyId} FOR UPDATE").ToListAsync(ct);
        return locked.Count != 0 && await db.Memberships.AnyAsync(m =>
                m.Id == tenant.MembershipId && m.UserId == userId &&
                m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, ct);
    }

    public static Task<bool> IsActiveChildAsync(FamiliesDbContext db, Guid childId, CancellationToken cancellationToken) =>
        db.Children.AnyAsync(child => child.Id == childId && child.Status == ChildStatus.Active, cancellationToken);

    public static string? Normalize(string? value, string field, int limit, Dictionary<string, string[]> errors)
    {
        value = value?.Trim();
        if (value is null or "")
        {
            return null;
        }

        if (value.Length > limit || value.Contains('\0'))
        {
            errors[field] = [$"Enter valid text up to {limit} characters."];
        }

        return value;
    }
}
