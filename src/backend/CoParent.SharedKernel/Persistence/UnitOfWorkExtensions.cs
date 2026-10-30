namespace CoParent.SharedKernel.Persistence;

/// <summary>Helpers for <see cref="IUnitOfWork"/>.</summary>
public static class UnitOfWorkExtensions
{
    /// <summary>Runs <paramref name="work"/> in the unit of work and returns its result once the work has finished.</summary>
    public static async Task<T> ExecuteAsync<T>(
        this IUnitOfWork unitOfWork,
        Func<CancellationToken, Task<T>> work,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(unitOfWork);
        ArgumentNullException.ThrowIfNull(work);

        T result = default!;
        await unitOfWork.ExecuteAsync(async ct => result = await work(ct), cancellationToken);
        return result;
    }
}
