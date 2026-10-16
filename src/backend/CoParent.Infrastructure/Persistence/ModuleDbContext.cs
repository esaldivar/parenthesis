using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CoParent.Infrastructure.Persistence;

/// <summary>A module's schema name, used for its tables and its migrations history table.</summary>
public interface IModuleSchema
{
    static abstract string Schema { get; }
}

/// <summary>
/// Base DbContext for modules. All module contexts in a scope share one connection, and saves join the
/// <see cref="UnitOfWork"/> transaction when one is active.
/// </summary>
public abstract class ModuleDbContext(DbContextOptions options, UnitOfWork unitOfWork) : DbContext(options)
{
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        await SyncTransactionAsync(cancellationToken);
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess) =>
        throw new NotSupportedException("Use SaveChangesAsync.");

    private async Task SyncTransactionAsync(CancellationToken cancellationToken)
    {
        var active = unitOfWork.CurrentTransaction;
        var enlisted = Database.CurrentTransaction?.GetDbTransaction();

        if (ReferenceEquals(active, enlisted))
        {
            return;
        }

        // Join the unit of work's transaction, or let go of one that has already completed.
        await Database.UseTransactionAsync(active, cancellationToken);
    }
}
