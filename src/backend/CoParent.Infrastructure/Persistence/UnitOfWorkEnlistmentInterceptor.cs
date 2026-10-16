using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace CoParent.Infrastructure.Persistence;

/// <summary>
/// Attached to every module DbContext: before a save, the context joins the scope's <see cref="UnitOfWork"/>
/// transaction, or lets go of one that has already completed. Works for any DbContext, including Identity's.
/// </summary>
public sealed class UnitOfWorkEnlistmentInterceptor(UnitOfWork unitOfWork) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result) =>
        throw new NotSupportedException("Use SaveChangesAsync so the save can join the unit of work.");

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);

        var database = eventData.Context!.Database;
        var active = unitOfWork.CurrentTransaction;

        if (!ReferenceEquals(active, database.CurrentTransaction?.GetDbTransaction()))
        {
            await database.UseTransactionAsync(active, cancellationToken);
        }

        return result;
    }
}
