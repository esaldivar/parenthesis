namespace CoParent.Infrastructure.Hosting;

/// <summary>The loop behind the app's timed cleanups: run the work on every tick, and keep going if one run fails.</summary>
public static class PeriodicWork
{
    public static async Task RunAsync(
        TimeSpan interval, TimeProvider clock, Func<CancellationToken, Task> work, Action<Exception> failed,
        CancellationToken stoppingToken)
    {
        ArgumentNullException.ThrowIfNull(work);
        ArgumentNullException.ThrowIfNull(failed);
        using var timer = new PeriodicTimer(interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await work(stoppingToken);
            }
#pragma warning disable CA1031 // The worker must keep running; the next tick retries.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                failed(exception);
            }
        }
    }
}
