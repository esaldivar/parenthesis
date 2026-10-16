using System.Data;
using CoParent.SharedKernel.Persistence;
using Npgsql;

namespace CoParent.Infrastructure.Persistence;

/// <summary>Owns the scope's transaction on the shared <see cref="NpgsqlConnection"/>.</summary>
public sealed class UnitOfWork(NpgsqlConnection connection) : IUnitOfWork
{
    public NpgsqlTransaction? CurrentTransaction { get; private set; }

    public async Task ExecuteAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(work);

        if (CurrentTransaction is not null)
        {
            await work(cancellationToken);
            return;
        }

        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        CurrentTransaction = transaction;
        try
        {
            await work(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
        finally
        {
            CurrentTransaction = null;
        }
    }
}
