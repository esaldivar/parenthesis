namespace CoParent.SharedKernel.Persistence;

/// <summary>
/// Runs work in one database transaction that every module's DbContext in the current scope joins,
/// so a change spanning modules (e.g. an approval applying a calendar change) commits or rolls back as a whole.
/// </summary>
public interface IUnitOfWork
{
    /// <summary>Joins the active transaction when called inside another unit of work.</summary>
    Task ExecuteAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken = default);
}
