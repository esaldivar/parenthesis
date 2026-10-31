using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Memories.Contracts;
using CoParent.Modules.Memories.Domain;
using CoParent.Modules.Memories.Endpoints;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// Cleans up event photo files (#403). Reads already refuse expired photos the moment they expire; this removes their
/// files afterwards, so the app never promises an exact deletion time.
/// <list type="bullet">
/// <item>Expired: both files removed; the row stays (as Expired) so the event can say when its photos were deleted.</item>
/// <item>Deleted by the uploader or with their account: both files and the row removed.</item>
/// <item>Uploads left unfinished for 15 minutes: any written file and the reservation removed.</item>
/// </list>
/// Each family is handled in its own tenant, like other cross-family jobs. A file that can't be removed now is retried
/// on the next pass, and its row keeps waiting.
/// </summary>
internal sealed partial class PhotoCleanup(IServiceScopeFactory scopes, IPhotoStore store, TimeProvider clock, ILogger<PhotoCleanup> logger)
    : IEventPhotoCleanup
{
    private const int PassSize = 200;

    private static readonly string[] _filter = [TenantContext.QueryFilterName];

    public async Task<int> CleanUpAsync(CancellationToken cancellationToken = default)
    {
        if (!store.IsConfigured)
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        var abandoned = now - MemoryEndpoints.AbandonedAfter;
        List<Guid> families;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MemoriesDbContext>();
            families = await Due(db.Photos.IgnoreQueryFilters(_filter), now, abandoned)
                .Select(p => p.FamilyId)
                .Distinct()
                .Take(PassSize)
                .ToListAsync(cancellationToken);
        }

        var cleaned = 0;
        foreach (var familyId in families)
        {
            cleaned += await CleanFamilyAsync(familyId, now, abandoned, cancellationToken);
        }

        if (cleaned > 0)
        {
            LogCleaned(cleaned);
        }

        return cleaned;
    }

    private async Task<int> CleanFamilyAsync(Guid familyId, DateTimeOffset now, DateTimeOffset abandoned, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantContext>().Resolve(familyId, Guid.Empty, FamilyRole.Parent);
        var db = scope.ServiceProvider.GetRequiredService<MemoriesDbContext>();
        var photos = await Due(db.Photos, now, abandoned).Take(PassSize).ToListAsync(cancellationToken);

        var cleaned = 0;
        foreach (var photo in photos)
        {
            try
            {
                await store.DeleteAsync(photo.PhotoPath, cancellationToken);
                await store.DeleteAsync(photo.ThumbnailPath, cancellationToken);
            }
#pragma warning disable CA1031 // One file that can't be removed now mustn't stop the rest; the next pass retries it.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFileFailed(exception);
                continue;
            }

            if (photo.State == PhotoState.Active)
            {
                photo.State = PhotoState.Expired;
                photo.RemovedAt = now;
            }
            else
            {
                db.Photos.Remove(photo);
            }

            cleaned++;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // A parent deleted one of these at the same moment; the next pass finishes it.
            return 0;
        }

        // Batches with nothing left in them go too.
        var empty = await db.Batches.Where(b => !db.Photos.Any(p => p.BatchId == b.Id)).ToListAsync(cancellationToken);
        if (empty.Count > 0)
        {
            db.Batches.RemoveRange(empty);
            await db.SaveChangesAsync(cancellationToken);
        }

        return cleaned;
    }

    private static IQueryable<EventPhoto> Due(IQueryable<EventPhoto> photos, DateTimeOffset now, DateTimeOffset abandoned) =>
        photos.Where(p => (p.State == PhotoState.Active && p.ExpiresAt <= now)
            || p.State == PhotoState.Deleted
            || (p.State == PhotoState.Uploading && p.CreatedAt < abandoned));

    [LoggerMessage(Level = LogLevel.Information, Message = "Cleaned up {Count} event photos")]
    private partial void LogCleaned(int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An event photo file couldn't be removed; the next cleanup retries it")]
    private partial void LogFileFailed(Exception exception);
}

/// <summary>Runs <see cref="PhotoCleanup"/> on a timer.</summary>
internal sealed partial class PhotoCleanupWorker(
    IEventPhotoCleanup cleanup, IOptions<EventPhotoOptions> options, TimeProvider clock, ILogger<PhotoCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.CleanupInterval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await cleanup.CleanUpAsync(stoppingToken);
            }
#pragma warning disable CA1031 // The worker must keep running; the next tick retries.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The event photo cleanup failed")]
    private partial void LogFailed(Exception exception);
}
