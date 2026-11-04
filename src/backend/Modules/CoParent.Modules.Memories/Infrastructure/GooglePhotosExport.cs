using System.Globalization;
using System.Security.Cryptography;
using System.Threading.Channels;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Memories.Contracts;
using CoParent.Modules.Memories.Domain;
using CoParent.Modules.Memories.Endpoints;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NodaTime;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// The #403 download rule, as export uses it: a parent may export a photo exactly when they may download it now.
/// Says why not, so the parent sees a plain reason.
/// </summary>
internal static class PhotoExportRules
{
    public static async Task<(PhotoExportReason Reason, EventPhoto? Photo)> CheckAsync(
        MemoriesDbContext db, Guid viewer, Guid photoId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var found = await db.Photos
            .Where(p => p.Id == photoId)
            .Join(db.Batches, p => p.BatchId, b => b.Id, (p, b) => new { Photo = p, b.UploaderMembershipId, b.VisibleToCoParent })
            .SingleOrDefaultAsync(cancellationToken);
        if (found is null || found.Photo.State is PhotoState.Deleted or PhotoState.Uploading)
        {
            return (PhotoExportReason.Deleted, null);
        }

        if (found.Photo.State == PhotoState.Expired || found.Photo.ExpiresAt <= now)
        {
            return (PhotoExportReason.Expired, null);
        }

        if (found.UploaderMembershipId != viewer
            && (!found.VisibleToCoParent
                || !await db.Settings.AnyAsync(s => s.MembershipId == found.UploaderMembershipId && s.AllowCoParentDownload, cancellationToken)))
        {
            return (PhotoExportReason.NotAllowed, null);
        }

        return (PhotoExportReason.None, found.Photo);
    }

    /// <summary>"Soccer final · Oct 12, 2026": the event's title and its start date in the family's time zone.</summary>
    public static string AlbumTitle(string title, DateTimeOffset startsAt, string timeZone)
    {
        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZone) ?? DateTimeZone.Utc;
        var date = Instant.FromDateTimeOffset(startsAt).InZone(zone).Date;
        var name = title.Trim();
        if (name.Length > 200)
        {
            name = name[..200].TrimEnd();
        }

        return string.Create(CultureInfo.InvariantCulture, $"{name} · {date.ToString("MMM d, yyyy", CultureInfo.InvariantCulture)}");
    }
}

/// <summary>
/// Counts Library API requests per UTC day so Parenthesis stops below Google's 10,000-a-day project limit (per server
/// instance; a guard, not an exact meter).
/// </summary>
internal sealed class GooglePhotosQuota(IOptions<GooglePhotosOptions> options, TimeProvider clock)
{
    private readonly Lock _lock = new();
    private DateOnly _day;
    private int _used;

    public bool TryTake(int requests)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        lock (_lock)
        {
            if (today != _day)
            {
                (_day, _used) = (today, 0);
            }

            if (_used + requests > options.Value.DailyRequestLimit)
            {
                return false;
            }

            _used += requests;
            return true;
        }
    }
}

/// <summary>Lets a request wake the export worker early, e.g. right after a parent queues photos.</summary>
internal sealed class GooglePhotosExportSignal
{
    private readonly Channel<bool> _channel = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });

    public void Poke() => _channel.Writer.TryWrite(true);

    /// <summary>Waits for a poke or the timeout, whichever is first.</summary>
    public async Task WaitAsync(TimeSpan timeout, TimeProvider clock, CancellationToken stoppingToken)
    {
        using var wait = new CancellationTokenSource(timeout, clock);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(wait.Token, stoppingToken);
        try
        {
            await _channel.Reader.ReadAsync(linked.Token);
        }
        catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
        {
            // The interval passed with no poke.
        }
    }
}

/// <summary>
/// Sends queued photos to each connected parent's Google Photos (#404), one parent at a time and never two
/// <c>batchCreate</c> calls at once for one parent (Google's guidance). For each photo:
/// <list type="number">
/// <item>Check the download rule; a photo the parent may no longer download is skipped, never sent.</item>
/// <item>Upload its stored bytes (or reuse a still-valid upload token from an earlier try).</item>
/// <item>Check again, then add the uploaded items to the event's album (made on first use) in one <c>batchCreate</c>.</item>
/// <item>Mark a photo exported only when Google's answer for that item says it was created.</item>
/// </list>
/// A timeout leaves the result unknown: the photo is marked Checking and retried with the same upload token. Google
/// treats the same bytes as the same item, so a retry normally doesn't make a second copy; exactly-once isn't promised.
/// </summary>
internal sealed partial class GooglePhotosExport(
    IServiceScopeFactory scopes,
    IOptions<GooglePhotosOptions> options,
    GooglePhotosQuota quota,
    TimeProvider clock,
    ILogger<GooglePhotosExport> logger) : IGooglePhotosExport
{
    private static readonly string[] _filter = [TenantContext.QueryFilterName];

    // google.rpc codes in a batchCreate item's status.
    private const int InvalidArgument = 3;
    private const int DeadlineExceeded = 4;
    private const int ResourceExhausted = 8;
    private const int Internal = 13;
    private const int Unavailable = 14;

    public async Task<int> ExportAsync(CancellationToken cancellationToken = default)
    {
        if (!options.Value.IsOn)
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        List<(Guid Id, Guid FamilyId, Guid MembershipId)> due;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MemoriesDbContext>();
            due = (await db.GooglePhotosConnections
                    .IgnoreQueryFilters(_filter)
                    .Where(c => c.Status == GooglePhotosStatus.Active
                        && db.PhotoExports.IgnoreQueryFilters(_filter).Any(e => e.ConnectionId == c.Id
                            && (e.State == PhotoExportState.Queued || e.State == PhotoExportState.Checking)
                            && e.NextAttemptAt <= now))
                    .Select(c => new { c.Id, c.FamilyId, c.MembershipId })
                    .ToListAsync(cancellationToken))
                .Select(c => (c.Id, c.FamilyId, c.MembershipId))
                .ToList();
        }

        var exported = 0;
        foreach (var (id, familyId, membershipId) in due)
        {
            using var scope = scopes.CreateScope();
            scope.ServiceProvider.GetRequiredService<TenantContext>().Resolve(familyId, membershipId, FamilyRole.Parent);
            try
            {
                exported += await ExportOneAsync(scope.ServiceProvider, id, cancellationToken);
            }
            catch (GooglePhotosException exception)
            {
                LogGoogleFailed(id, exception.Failure, (int?)exception.Status);
            }
            catch (HttpRequestException)
            {
                LogUnreachable(id);
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                LogUnreachable(id);
            }
        }

        return exported;
    }

    private async Task<int> ExportOneAsync(IServiceProvider services, Guid connectionId, CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<MemoriesDbContext>();
        var save = () => services.GetRequiredService<IUnitOfWork>().ExecuteAsync(db.SaveChangesAsync, CancellationToken.None);
        var connection = await db.GooglePhotosConnections.SingleOrDefaultAsync(
            c => c.Id == connectionId && c.Status == GooglePhotosStatus.Active, cancellationToken);
        if (connection is null)
        {
            return 0;
        }

        var now = clock.GetUtcNow();
        var exports = await db.PhotoExports
            .Where(e => e.ConnectionId == connectionId
                && (e.State == PhotoExportState.Queued || e.State == PhotoExportState.Checking)
                && e.NextAttemptAt <= now)
            .OrderBy(e => e.CreatedAt)
            .Take(options.Value.MaxPhotosPerPass)
            .ToListAsync(cancellationToken);
        if (exports.Count == 0)
        {
            return 0;
        }

        // At most one upload per photo, plus an album and a batchCreate per event.
        if (!quota.TryTake((exports.Count * 3) + 1))
        {
            var tomorrow = new DateTimeOffset(now.UtcDateTime.Date.AddDays(1), TimeSpan.Zero);
            foreach (var export in exports)
            {
                (export.Reason, export.NextAttemptAt, export.UpdatedAt) = (PhotoExportReason.RateLimited, tomorrow, now);
            }

            await save();
            LogDailyLimit();
            return 0;
        }

        var tokens = services.GetRequiredService<GooglePhotosTokens>();
        string accessToken;
        try
        {
            accessToken = await tokens.AccessTokenAsync(connection.Id, connection.ProtectedRefreshToken, cancellationToken);
        }
        catch (Exception exception) when (exception is CryptographicException
            || (exception is GooglePhotosException g && g.Failure == GooglePhotosFailure.Revoked))
        {
            return await StopAsync(services, connection, exports, now);
        }

        var exported = 0;
        try
        {
            var ready = await UploadAsync(services, connection, accessToken, exports, now, cancellationToken);
            foreach (var group in ready.GroupBy(x => x.Export.EventId))
            {
                exported += await AddToAlbumAsync(services, connection, accessToken, group.Key, [.. group], now, cancellationToken);
            }
        }
        catch (GooglePhotosException exception) when (exception.Failure == GooglePhotosFailure.Revoked)
        {
            return await StopAsync(services, connection, exports.Where(e => e.Waiting).ToList(), now);
        }
        finally
        {
            // Whatever reached Google is recorded, even when a later step failed.
            await save();
        }

        return exported;
    }

    /// <summary>Checks each photo and uploads the ones still allowed. Returns them with their upload tokens.</summary>
    private static async Task<List<(PhotoExport Export, EventPhoto Photo)>> UploadAsync(
        IServiceProvider services,
        GooglePhotosConnection connection,
        string accessToken,
        List<PhotoExport> exports,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<MemoriesDbContext>();
        var store = services.GetRequiredService<IPhotoStore>();
        var google = services.GetRequiredService<GooglePhotosClient>();
        var ready = new List<(PhotoExport, EventPhoto)>();
        foreach (var export in exports)
        {
            var (reason, photo) = await PhotoExportRules.CheckAsync(db, connection.MembershipId, export.PhotoId, now, cancellationToken);
            if (photo is null)
            {
                NotSent(export, reason, now);
                continue;
            }

            if (export.UploadToken is null || export.UploadTokenExpiresAt <= now)
            {
                await using var content = await store.OpenAsync(photo.PhotoPath, cancellationToken);
                if (content is null)
                {
                    NotSent(export, PhotoExportReason.Deleted, now);
                    continue;
                }

                try
                {
                    export.UploadToken = await google.UploadAsync(accessToken, content, EventPhotoImages.ContentType, cancellationToken);
                    (export.UploadTokenExpiresAt, export.UpdatedAt) = (now + GooglePhotosClient.UploadTokenLifetime, now);
                }
                catch (Exception exception) when (Retryable(exception, out var failure))
                {
                    Defer(export, failure, ambiguous: false, now);
                    continue;
                }
            }

            ready.Add((export, photo));
        }

        return ready;
    }

    /// <summary>Checks again, then creates the event's uploaded items in its album, trusting only Google's per-item answer.</summary>
    private async Task<int> AddToAlbumAsync(
        IServiceProvider services,
        GooglePhotosConnection connection,
        string accessToken,
        Guid eventId,
        List<(PhotoExport Export, EventPhoto Photo)> uploaded,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<MemoriesDbContext>();
        var google = services.GetRequiredService<GooglePhotosClient>();
        var items = new List<(PhotoExport Export, NewMediaItem Item)>();
        PhotoEvent? photoEvent = null;
        foreach (var (export, photo) in uploaded)
        {
            var (reason, current) = await PhotoExportRules.CheckAsync(db, connection.MembershipId, export.PhotoId, clock.GetUtcNow(), cancellationToken);
            if (current is null)
            {
                NotSent(export, reason, now);
                continue;
            }

            photoEvent ??= await services.GetRequiredService<IEventPhotoCalendar>().FindAsync(eventId, cancellationToken);
            var name = MemoryEndpoints.DownloadName(photoEvent?.Title ?? "Photo", photoEvent?.StartsAt ?? photo.CreatedAt, photo);
            items.Add((export, new NewMediaItem(export.UploadToken!, name)));
        }

        if (items.Count == 0)
        {
            return 0;
        }

        IReadOnlyList<MediaItemResult> results;
        try
        {
            var albumId = await AlbumIdAsync(services, connection, accessToken, eventId, photoEvent, fresh: false, cancellationToken);
            try
            {
                results = await google.BatchCreateAsync(accessToken, albumId, [.. items.Select(i => i.Item)], cancellationToken);
            }
            catch (GooglePhotosException exception) when (exception.Failure == GooglePhotosFailure.Rejected)
            {
                // Google no longer accepts the album (the parent probably deleted it): make a new one and try once more.
                albumId = await AlbumIdAsync(services, connection, accessToken, eventId, photoEvent, fresh: true, cancellationToken);
                results = await google.BatchCreateAsync(accessToken, albumId, [.. items.Select(i => i.Item)], cancellationToken);
            }
        }
        catch (Exception exception) when (Retryable(exception, out var failure))
        {
            // A timeout or server error may still have created the items: retry the same request later.
            foreach (var (export, _) in items)
            {
                Defer(export, failure, ambiguous: failure != GooglePhotosFailure.RateLimited, now);
            }

            return 0;
        }

        var byToken = results.GroupBy(r => r.UploadToken).ToDictionary(g => g.Key, g => g.First());
        var created = 0;
        foreach (var (export, item) in items)
        {
            if (!byToken.TryGetValue(item.UploadToken, out var result))
            {
                export.RetryLater(PhotoExportReason.GoogleError, ambiguous: true, TimeSpan.Zero, now);
            }
            else if (result.Created)
            {
                export.GoogleMediaItemId = result.MediaItemId;
                export.Finish(PhotoExportState.Exported, PhotoExportReason.None, now);
                created++;
            }
            else if (result.Code == ResourceExhausted)
            {
                export.Finish(PhotoExportState.Failed, PhotoExportReason.StorageFull, now);
            }
            else if (result.Code == InvalidArgument)
            {
                // Usually an upload token Google no longer accepts: upload the bytes again next time.
                (export.UploadToken, export.UploadTokenExpiresAt) = (null, null);
                export.RetryLater(PhotoExportReason.GoogleError, ambiguous: false, TimeSpan.Zero, now);
            }
            else if (result.Code is DeadlineExceeded or Internal or Unavailable)
            {
                export.RetryLater(PhotoExportReason.GoogleError, ambiguous: true, TimeSpan.Zero, now);
            }
            else
            {
                export.Finish(PhotoExportState.Failed, PhotoExportReason.GoogleError, now);
            }
        }

        return created;
    }

    /// <summary>The event's album in this parent's Google Photos, made the first time (or again when Google lost it).</summary>
    private static async Task<string> AlbumIdAsync(
        IServiceProvider services,
        GooglePhotosConnection connection,
        string accessToken,
        Guid eventId,
        PhotoEvent? photoEvent,
        bool fresh,
        CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<MemoriesDbContext>();
        var album = await db.GooglePhotosAlbums.SingleOrDefaultAsync(a => a.ConnectionId == connection.Id && a.EventId == eventId, cancellationToken);
        if (album is not null && !fresh)
        {
            return album.GoogleAlbumId;
        }

        var timeZone = await services.GetRequiredService<IFamilyRoster>().TimeZoneAsync(cancellationToken);
        var title = PhotoExportRules.AlbumTitle(photoEvent?.Title ?? "Family Memories", photoEvent?.StartsAt ?? DateTimeOffset.UnixEpoch, timeZone);
        var id = await services.GetRequiredService<GooglePhotosClient>().CreateAlbumAsync(accessToken, title, cancellationToken);
        if (album is null)
        {
            db.GooglePhotosAlbums.Add(new GooglePhotosAlbum { FamilyId = connection.FamilyId, ConnectionId = connection.Id, EventId = eventId, GoogleAlbumId = id });
        }
        else
        {
            album.GoogleAlbumId = id;
        }

        // Saved now, so a later failure in this pass doesn't make a second album next time.
        await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(db.SaveChangesAsync, CancellationToken.None);
        return id;
    }

    /// <summary>The photo wasn't sent because it changed first. An expired photo is a failure the parent should see as such.</summary>
    private static void NotSent(PhotoExport export, PhotoExportReason reason, DateTimeOffset now) =>
        export.Finish(reason == PhotoExportReason.Expired ? PhotoExportState.Failed : PhotoExportState.Skipped, reason, now);

    private static void Defer(PhotoExport export, GooglePhotosFailure failure, bool ambiguous, DateTimeOffset now)
    {
        if (failure == GooglePhotosFailure.Rejected)
        {
            export.Finish(PhotoExportState.Failed, PhotoExportReason.GoogleError, now);
            return;
        }

        var rateLimited = failure == GooglePhotosFailure.RateLimited;
        export.RetryLater(
            rateLimited ? PhotoExportReason.RateLimited : PhotoExportReason.GoogleError,
            ambiguous,
            rateLimited ? TimeSpan.FromSeconds(30) : TimeSpan.FromSeconds(1),
            now);
    }

    /// <summary>Failures worth retrying, or refusals to record. A revoked grant isn't one: it stops the connection.</summary>
    private static bool Retryable(Exception exception, out GooglePhotosFailure failure)
    {
        failure = exception switch
        {
            GooglePhotosException g => g.Failure,
            HttpRequestException or TaskCanceledException => GooglePhotosFailure.Transient,
            _ => GooglePhotosFailure.Revoked,
        };
        return failure != GooglePhotosFailure.Revoked;
    }

    private async Task<int> StopAsync(IServiceProvider services, GooglePhotosConnection connection, List<PhotoExport> waiting, DateTimeOffset now)
    {
        connection.Stop(GooglePhotosProblem.AccessRevoked);
        foreach (var export in waiting)
        {
            (export.Reason, export.UpdatedAt) = (PhotoExportReason.Reconnect, now);
        }

        services.GetRequiredService<GooglePhotosTokens>().Forget(connection.Id);
        await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(
            services.GetRequiredService<MemoriesDbContext>().SaveChangesAsync, CancellationToken.None);
        LogStopped(connection.Id);
        return 0;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Google Photos export for connection {ConnectionId} failed: {Failure} (HTTP {Status}); retrying next pass")]
    private partial void LogGoogleFailed(Guid connectionId, GooglePhotosFailure failure, int? status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Google Photos was unreachable for connection {ConnectionId}; retrying next pass")]
    private partial void LogUnreachable(Guid connectionId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Google Photos export for connection {ConnectionId} stopped: access revoked")]
    private partial void LogStopped(Guid connectionId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Google Photos exports reached Parenthesis's daily request limit; waiting until tomorrow (UTC)")]
    private partial void LogDailyLimit();
}

/// <summary>Runs <see cref="GooglePhotosExport"/> every interval, or sooner when poked.</summary>
internal sealed partial class GooglePhotosExportWorker(
    IGooglePhotosExport export,
    GooglePhotosExportSignal signal,
    IOptions<GooglePhotosOptions> options,
    TimeProvider clock,
    ILogger<GooglePhotosExportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.IsOn || !options.Value.BackgroundExport)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            await signal.WaitAsync(options.Value.ExportInterval, clock, stoppingToken);
            try
            {
                await export.ExportAsync(stoppingToken);
            }
#pragma warning disable CA1031 // The worker must keep running; the next pass retries.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The Google Photos export pass failed")]
    private partial void LogFailed(Exception exception);
}
