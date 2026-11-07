using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.SharedRecords.Contracts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.SharedRecords;

/// <summary>
/// Closing a family only marks its reports removed, inside the closing transaction, so a rolled-back closure loses no
/// file. This pass runs afterwards: it deletes each file, then the row. A file that can't be deleted now, or storage
/// that isn't configured yet, leaves the row (and its path) waiting for the next pass, so nothing is orphaned.
/// </summary>
internal sealed partial class AttachmentCleanup(
    IServiceScopeFactory scopes, IAttachmentStore store, ILogger<AttachmentCleanup> logger) : ISharedRecordsCleanup
{
    private const int PassSize = 200;

    public async Task<int> CleanUpAsync(CancellationToken cancellationToken = default)
    {
        if (!store.IsConfigured)
        {
            return 0;
        }

        List<Guid> families;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SharedRecordsDbContext>();
            families = await db.Entries.IgnoreQueryFilters()
                .Where(e => e.RemovedAt != null)
                .Select(e => e.FamilyId)
                .Distinct()
                .Take(PassSize)
                .ToListAsync(cancellationToken);
        }

        var cleaned = 0;
        foreach (var familyId in families)
        {
            cleaned += await CleanFamilyAsync(familyId, cancellationToken);
        }

        if (cleaned > 0)
        {
            LogCleaned(cleaned);
        }

        return cleaned;
    }

    private async Task<int> CleanFamilyAsync(Guid familyId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantContext>().Resolve(familyId, Guid.Empty, FamilyRole.Parent);
        var db = scope.ServiceProvider.GetRequiredService<SharedRecordsDbContext>();
        var entries = await db.Entries.IgnoreQueryFilters()
            .Where(e => e.FamilyId == familyId && e.RemovedAt != null)
            .Take(PassSize)
            .ToListAsync(cancellationToken);
        var cleaned = 0;
        foreach (var entry in entries)
        {
            try
            {
                await store.DeleteAsync(entry.AttachmentPath, cancellationToken);
            }
#pragma warning disable CA1031 // One file that can't be removed now mustn't stop the rest; the next pass retries it.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFileFailed(exception);
                continue;
            }

            db.Entries.Remove(entry);
            cleaned++;
        }

        await db.SaveChangesAsync(cancellationToken);
        return cleaned;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Removed {Count} shared record attachments")]
    private partial void LogCleaned(int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A shared record attachment couldn't be removed; the next pass retries it")]
    private partial void LogFileFailed(Exception exception);
}

/// <summary>Runs the attachment cleanup on a timer (hourly by default).</summary>
internal sealed partial class AttachmentCleanupWorker(
    ISharedRecordsCleanup cleanup, IOptions<AttachmentOptions> options, TimeProvider clock, ILogger<AttachmentCleanupWorker> logger)
    : BackgroundService
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

    [LoggerMessage(Level = LogLevel.Error, Message = "The shared record attachment cleanup failed")]
    private partial void LogFailed(Exception exception);
}
