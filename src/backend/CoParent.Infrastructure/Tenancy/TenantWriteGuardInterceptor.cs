using CoParent.SharedKernel.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CoParent.Infrastructure.Tenancy;

/// <summary>
/// Last line of defence for writes (ADR-0002): a save fails if any family-scoped row being inserted, updated or
/// deleted belongs to a family other than the request's resolved tenant, including a row moved between families.
/// </summary>
public sealed class TenantWriteGuardInterceptor(ITenantContext tenant) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Guard(eventData.Context!);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Guard(eventData.Context!);
        return result;
    }

    private void Guard(DbContext context)
    {
        foreach (var entry in context.ChangeTracker.Entries<IFamilyScoped>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
            {
                continue;
            }

            var original = entry.State == EntityState.Added
                ? entry.Entity.FamilyId
                : entry.Property(e => e.FamilyId).OriginalValue;

            if (!tenant.IsResolved || entry.Entity.FamilyId != tenant.FamilyId || original != tenant.FamilyId)
            {
                throw new CrossTenantWriteException(entry.Metadata.DisplayName());
            }
        }
    }
}

public sealed class CrossTenantWriteException : InvalidOperationException
{
    public CrossTenantWriteException(string entityType)
        : base($"Blocked a write to {entityType} outside the current family.")
    {
    }

    public CrossTenantWriteException()
    {
    }

    public CrossTenantWriteException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
