using System.Globalization;
using System.Text;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Memories.Domain;
using CoParent.Modules.Memories.Infrastructure;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;

namespace CoParent.Modules.Memories.Endpoints;

/// <summary>One photo the viewer may see. <c>DownloadUrl</c> is null when they may view it but not download it.</summary>
internal sealed record PhotoView(
    Guid Id, int Position, int Width, int Height, DateTimeOffset ExpiresAt, string ThumbnailUrl, string Url, string? DownloadUrl);

/// <summary>
/// One parent's photos from one upload. <c>Yours</c> batches show their sharing switch; the co-parent's appear only while
/// shared, and <c>DownloadsAllowed</c> says whether that parent allows downloads of them.
/// </summary>
internal sealed record BatchView(
    Guid Id, bool Yours, bool VisibleToCoParent, bool DownloadsAllowed, DateTimeOffset CreatedAt, IReadOnlyList<PhotoView> Photos);

/// <summary>
/// Whether the viewer can add photos now and how much room they have. <c>Available</c> is false while uploads are
/// switched off; <c>Blocked</c> names why this event can't take their photos (see <see cref="UploadBlock"/>).
/// </summary>
internal sealed record UploadsView(
    bool Available,
    string? Blocked,
    int Cap,
    int Used,
    int Remaining,
    long StorageUsedBytes,
    long StorageLimitBytes,
    int MaxPerUpload,
    long MaxFileBytes);

/// <summary>An event's photos for the viewer. <c>PhotosDeletedOn</c>: when its last photos the viewer could see expired.</summary>
internal sealed record EventPhotosView(
    Guid EventId,
    string Title,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool AllDay,
    bool Cancelled,
    UploadsView Uploads,
    IReadOnlyList<BatchView> Batches,
    DateTimeOffset? PhotosDeletedOn);

/// <summary>A Family Memory: one event with photos the viewer may see. <c>ExpiresAt</c> is its first photo to go.</summary>
internal sealed record MemoryView(
    Guid EventId,
    string Title,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool AllDay,
    bool Cancelled,
    int PhotoCount,
    int YourPhotoCount,
    int SharedWithYouCount,
    DateTimeOffset ExpiresAt,
    string CoverThumbnailUrl);

internal sealed record UploadedView(Guid BatchId, PhotoView Photo);

internal sealed record BatchSharingRequest(bool? VisibleToCoParent);

internal sealed record MemorySettingsView(bool AllowCoParentDownload, long StorageUsedBytes, long StorageLimitBytes);

internal sealed record MemorySettingsRequest(bool? AllowCoParentDownload);

/// <summary>
/// Event photos and Family Memories (#403). Parents only: child sessions never reach these endpoints (tenant gate) and
/// are refused here as well. Every rule is checked on the server:
/// <list type="bullet">
/// <item>A batch is private to its uploader until they turn on "Visible to Co-Parent". Anything the viewer may not
/// see answers 404, so guessed ids learn nothing, not even that a private photo exists.</item>
/// <item>The co-parent may download a shared photo only while its uploader allows downloads. Uploaders can always
/// download their own photos until they expire.</item>
/// <item>Files are served only through these endpoints, checked on every request (<c>private, no-cache</c> with an
/// ETag), so turning sharing or downloads off applies to the next request. Expired photos are never served.</item>
/// <item>Spots and storage are reserved under a per-parent lock, so parallel uploads can't overshoot either.</item>
/// </list>
/// </summary>
internal static partial class MemoryEndpoints
{
    public const string UploadRateLimitPolicy = "event-photo-upload";

    /// <summary>An upload that never finished keeps its reservation this long before the cleanup releases it.</summary>
    public static readonly TimeSpan AbandonedAfter = TimeSpan.FromMinutes(15);

    // Lock namespace for pg_advisory_xact_lock(int, int): one lock per uploader serializes their spot and storage checks.
    private const int UploaderLockNamespace = 403;

    private static readonly PhotoState[] _counted = [PhotoState.Uploading, PhotoState.Active];

    public static void Map(IEndpointRouteBuilder family)
    {
        var memories = family.MapGroup("/memories").WithTags("Family Memories");
        memories.MapGet("/", ListAsync);
        memories.MapGet("/events/{eventId:guid}", EventAsync);
        memories.MapPost("/events/{eventId:guid}/photos", UploadAsync).RequireRateLimiting(UploadRateLimitPolicy);
        memories.MapPatch("/batches/{batchId:guid}", ShareAsync);
        memories.MapGet("/photos/{photoId:guid}", PhotoAsync);
        memories.MapGet("/photos/{photoId:guid}/thumbnail", ThumbnailAsync);
        memories.MapGet("/photos/{photoId:guid}/download", DownloadAsync);
        memories.MapDelete("/photos/{photoId:guid}", DeleteAsync);
        memories.MapGet("/settings", SettingsAsync);
        memories.MapPut("/settings", SaveSettingsAsync);
    }

    private static string PhotoUrl(Guid familyId, Guid photoId) => $"/api/families/{familyId}/memories/photos/{photoId}";

    /// <summary>The viewer's Family Memories: one per event with photos they may see, newest event first.</summary>
    private static async Task<Results<Ok<List<MemoryView>>, ForbidHttpResult>> ListAsync(
        ITenantContext tenant, MemoriesDbContext db, IEventPhotoCalendar calendar, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var now = clock.GetUtcNow();
        var photos = await Visible(db, tenant.MembershipId, now)
            .Select(x => new { x.Photo.Id, x.Photo.EventId, x.Photo.ExpiresAt, x.Photo.CreatedAt, x.Photo.Position, Yours = x.Batch.UploaderMembershipId == tenant.MembershipId })
            .ToListAsync(cancellationToken);
        var events = await calendar.FindManyAsync(photos.Select(p => p.EventId).Distinct().ToList(), cancellationToken);

        var memories = photos
            .Where(p => events.ContainsKey(p.EventId))
            .GroupBy(p => p.EventId)
            .Select(group =>
            {
                var e = events[group.Key];
                var cover = group.OrderBy(p => p.CreatedAt).ThenBy(p => p.Position).First();
                return new MemoryView(
                    e.Id,
                    e.Title,
                    e.StartsAt,
                    e.EndsAt,
                    e.AllDay,
                    e.IsCancelled,
                    group.Count(),
                    group.Count(p => p.Yours),
                    group.Count(p => !p.Yours),
                    group.Min(p => p.ExpiresAt),
                    PhotoUrl(tenant.FamilyId, cover.Id) + "/thumbnail");
            })
            .OrderByDescending(m => m.StartsAt)
            .ToList();
        return TypedResults.Ok(memories);
    }

    /// <summary>An event's photos the viewer may see, and whether (and how many) they can add.</summary>
    private static async Task<Results<Ok<EventPhotosView>, NotFound, ForbidHttpResult>> EventAsync(
        Guid eventId,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar calendar,
        IFamilyRoster roster,
        IPhotoStore store,
        IOptions<EventPhotoOptions> options,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (await calendar.FindAsync(eventId, cancellationToken) is not { } photoEvent || photoEvent.IsUnavailable)
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var visible = await Visible(db, tenant.MembershipId, now)
            .Where(x => x.Photo.EventId == eventId)
            .Select(x => new { x.Photo, x.Batch })
            .ToListAsync(cancellationToken);
        var allowsDownload = await DownloadAllowedAsync(db, visible.Select(x => x.Batch.UploaderMembershipId), cancellationToken);

        var batches = visible
            .GroupBy(x => x.Batch.Id)
            .Select(group =>
            {
                var batch = group.First().Batch;
                var yours = batch.UploaderMembershipId == tenant.MembershipId;
                var downloads = yours || allowsDownload.Contains(batch.UploaderMembershipId);
                return new BatchView(
                    batch.Id,
                    yours,
                    batch.VisibleToCoParent,
                    downloads,
                    batch.CreatedAt,
                    group.OrderBy(x => x.Photo.Position).Select(x => View(tenant.FamilyId, x.Photo, downloads)).ToList());
            })
            .OrderBy(b => b.CreatedAt)
            .ToList();

        DateTimeOffset? deletedOn = null;
        if (batches.Count == 0)
        {
            deletedOn = await db.Photos
                .Where(p => p.EventId == eventId && (p.State == PhotoState.Expired || (p.State == PhotoState.Active && p.ExpiresAt <= now)))
                .Join(db.Batches, p => p.BatchId, b => b.Id, (p, b) => new { p.ExpiresAt, b.UploaderMembershipId, b.VisibleToCoParent })
                .Where(x => x.UploaderMembershipId == tenant.MembershipId || x.VisibleToCoParent)
                .MaxAsync(x => (DateTimeOffset?)x.ExpiresAt, cancellationToken);
        }

        var uploads = await UploadsAsync(db, photoEvent, tenant.MembershipId, parents, store, options.Value, now, cancellationToken);
        return TypedResults.Ok(new EventPhotosView(
            photoEvent.Id, photoEvent.Title, photoEvent.StartsAt, photoEvent.EndsAt, photoEvent.AllDay, photoEvent.IsCancelled, uploads, batches, deletedOn));
    }

    /// <summary>
    /// Adds one photo (the raw file as the body) to the viewer's batch on an event, starting a batch when
    /// <paramref name="batchId"/> is missing. A batch takes at most 5 photos, during the 30 minutes after it started.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid eventId,
        Guid? batchId,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar calendar,
        IFamilyRoster roster,
        IPhotoStore store,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        IOptions<EventPhotoOptions> options,
        TimeProvider clock,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!options.Value.UploadsEnabled || !store.IsConfigured)
        {
            return Problem(StatusCodes.Status503ServiceUnavailable, "uploads-off", "Adding photos isn't available yet.");
        }

        if (await calendar.FindAsync(eventId, cancellationToken) is not { } photoEvent || photoEvent.IsUnavailable)
        {
            return TypedResults.NotFound();
        }

        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        if (PhotoRules.Block(photoEvent, tenant.MembershipId, parents, clock.GetUtcNow()) is { } block)
        {
            return Blocked(block);
        }

        if (await ReadUploadAsync(http.Request, cancellationToken) is not { } upload)
        {
            return Rejected(PhotoRejection.TooLarge);
        }

        var processed = EventPhotoImages.Process(upload);
        if (processed.Rejection is { } rejection)
        {
            return Rejected(rejection);
        }

        // Reserve the spot and the storage under this parent's lock, then write the files outside the transaction.
        var now = clock.GetUtcNow();
        EventPhoto? photo = null;
        IResult? refusal = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.Database.ExecuteSqlAsync(
                $"SELECT pg_advisory_xact_lock({UploaderLockNamespace}, {LockKey(tenant.MembershipId)})", ct);

            // Recheck inside the lock: the event or the family may have changed since the first check.
            var current = await calendar.FindAsync(eventId, ct);
            var parentsNow = await roster.ActiveParentMembershipIdsAsync(ct);
            if (current is null)
            {
                refusal = TypedResults.NotFound();
                return;
            }

            if (PhotoRules.Block(current, tenant.MembershipId, parentsNow, now) is { } changed)
            {
                refusal = Blocked(changed);
                return;
            }

            var cap = PhotoRules.Cap(current, tenant.MembershipId, parentsNow);
            var onEvent = await Counted(db, tenant.MembershipId, now).CountAsync(p => p.EventId == eventId, ct);
            if (onEvent >= cap)
            {
                refusal = Problem(StatusCodes.Status409Conflict, "event-full", $"You've added all {cap} of your photos for this event.");
                return;
            }

            var used = await Counted(db, tenant.MembershipId, now).SumAsync(p => p.PhotoBytes + p.ThumbnailBytes, ct);
            if (used + processed.Photo.Length + processed.Thumbnail.Length > PhotoRules.StorageAllowanceBytes)
            {
                refusal = Problem(StatusCodes.Status409Conflict, "storage-full", "You don't have enough photo storage left for this photo.");
                return;
            }

            var batch = await BatchForUploadAsync(db, batchId, eventId, tenant, now, ct);
            if (batch.Refusal is not null)
            {
                refusal = batch.Refusal;
                return;
            }

            var position = await db.Photos.CountAsync(p => p.BatchId == batch.Id, ct) + 1;
            photo = new EventPhoto
            {
                FamilyId = tenant.FamilyId,
                BatchId = batch.Id,
                EventId = eventId,
                UploaderMembershipId = tenant.MembershipId,
                Position = position,
                State = PhotoState.Uploading,
                Width = processed.Width,
                Height = processed.Height,
                PhotoBytes = processed.Photo.Length,
                ThumbnailBytes = processed.Thumbnail.Length,
                CreatedAt = now,
                ExpiresAt = now + PhotoRules.Retention,
            };
            db.Photos.Add(photo);
            await db.SaveChangesAsync(ct);
        }, cancellationToken);

        if (refusal is not null || photo is null)
        {
            return refusal ?? TypedResults.NotFound();
        }

        try
        {
            await store.PutAsync(photo.PhotoPath, processed.Photo, cancellationToken);
            await store.PutAsync(photo.ThumbnailPath, processed.Thumbnail, cancellationToken);
        }
#pragma warning disable CA1031 // Any storage failure gives the reservation back and tells the parent to retry.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogStorageFailed(loggers.CreateLogger(typeof(MemoryEndpoints)), exception);
            await ReleaseAsync(db, store, photo, CancellationToken.None);
            return Problem(StatusCodes.Status503ServiceUnavailable, "storage-failed", "The photo couldn't be saved. Try again.");
        }

        photo.State = PhotoState.Active;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "event_photo.added", "event_photo", photo.Id), ct);
        }, cancellationToken);

        return TypedResults.Created(PhotoUrl(tenant.FamilyId, photo.Id), new UploadedView(photo.BatchId, View(tenant.FamilyId, photo, downloads: true)));
    }

    /// <summary>Turns one of the viewer's own batches' "Visible to Co-Parent" on or off. Anyone else's answers 404.</summary>
    private static async Task<Results<NoContent, NotFound, ValidationProblem, ForbidHttpResult>> ShareAsync(
        Guid batchId,
        BatchSharingRequest request,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.VisibleToCoParent is not { } visible)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(BatchSharingRequest.VisibleToCoParent)] = ["Say whether the co-parent can see these photos."],
            });
        }

        var batch = await db.Batches.SingleOrDefaultAsync(b => b.Id == batchId && b.UploaderMembershipId == tenant.MembershipId, cancellationToken);
        if (batch is null)
        {
            return TypedResults.NotFound();
        }

        if (batch.VisibleToCoParent != visible)
        {
            batch.VisibleToCoParent = visible;
            await unitOfWork.ExecuteAsync(async ct =>
            {
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(
                    new AuditEntry(tenant.FamilyId, http.User.GetUserId(), visible ? "photo_batch.shared" : "photo_batch.unshared", "photo_batch", batch.Id), ct);
            }, cancellationToken);
        }

        return TypedResults.NoContent();
    }

    private static Task<IResult> PhotoAsync(
        Guid photoId, HttpContext http, ITenantContext tenant, MemoriesDbContext db, IPhotoStore store, TimeProvider clock, CancellationToken cancellationToken) =>
        ServeAsync(photoId, thumbnail: false, download: false, http, tenant, db, null, store, clock, cancellationToken);

    private static Task<IResult> ThumbnailAsync(
        Guid photoId, HttpContext http, ITenantContext tenant, MemoriesDbContext db, IPhotoStore store, TimeProvider clock, CancellationToken cancellationToken) =>
        ServeAsync(photoId, thumbnail: true, download: false, http, tenant, db, null, store, clock, cancellationToken);

    private static Task<IResult> DownloadAsync(
        Guid photoId,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar calendar,
        IPhotoStore store,
        TimeProvider clock,
        CancellationToken cancellationToken) =>
        ServeAsync(photoId, thumbnail: false, download: true, http, tenant, db, calendar, store, clock, cancellationToken);

    /// <summary>
    /// Sends a photo, its thumbnail or a download, only when this viewer may have it now; anything else answers 404.
    /// Views are <c>private, no-cache</c> with the photo id as ETag, so browsers revalidate and lost access applies to
    /// the next request. Downloads also need the uploader's download permission, and are never cached.
    /// </summary>
    private static async Task<IResult> ServeAsync(
        Guid photoId,
        bool thumbnail,
        bool download,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar? calendar,
        IPhotoStore store,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var found = await Visible(db, tenant.MembershipId, clock.GetUtcNow())
            .Where(x => x.Photo.Id == photoId)
            .Select(x => new { x.Photo, x.Batch.UploaderMembershipId })
            .SingleOrDefaultAsync(cancellationToken);
        if (found is null || !store.IsConfigured)
        {
            return TypedResults.NotFound();
        }

        var photo = found.Photo;
        if (download && found.UploaderMembershipId != tenant.MembershipId
            && !(await DownloadAllowedAsync(db, [found.UploaderMembershipId], cancellationToken)).Contains(found.UploaderMembershipId))
        {
            return TypedResults.NotFound();
        }

        http.Response.Headers.XContentTypeOptions = "nosniff";
        if (!download)
        {
            var etag = new EntityTagHeaderValue($"\"{photo.Id:N}{(thumbnail ? "t" : "p")}\"");
            http.Response.Headers.CacheControl = "private, no-cache";
            http.Response.Headers.ETag = etag.ToString();
            if (http.Request.Headers.IfNoneMatch.ToString() == etag.ToString())
            {
                return TypedResults.StatusCode(StatusCodes.Status304NotModified);
            }
        }
        else
        {
            http.Response.Headers.CacheControl = "no-store";
        }

        var content = await store.OpenAsync(thumbnail ? photo.ThumbnailPath : photo.PhotoPath, cancellationToken);
        if (content is null)
        {
            return TypedResults.NotFound();
        }

        if (!download)
        {
            return TypedResults.Stream(content, EventPhotoImages.ContentType);
        }

        var e = calendar is null ? null : await calendar.FindAsync(photo.EventId, cancellationToken);
        return TypedResults.Stream(content, EventPhotoImages.ContentType, DownloadName(e?.Title ?? "Photo", e?.StartsAt ?? photo.CreatedAt, photo));
    }

    /// <summary>The uploader deletes one of their photos: gone for both parents now, spot and storage freed at once.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DeleteAsync(
        Guid photoId,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IPhotoStore store,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var photo = await db.Photos.SingleOrDefaultAsync(
            p => p.Id == photoId && p.UploaderMembershipId == tenant.MembershipId && p.State == PhotoState.Active, cancellationToken);
        if (photo is null)
        {
            return TypedResults.NotFound();
        }

        photo.State = PhotoState.Deleted;
        photo.RemovedAt = clock.GetUtcNow();
        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "event_photo.deleted", "event_photo", photo.Id), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Deleted or expired by another request at the same moment: it's gone either way.
            return TypedResults.NoContent();
        }

        // The cleanup removes the files and the row; trying now just makes it quicker.
        await TryDeleteFilesAsync(store, photo);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<MemorySettingsView>, ForbidHttpResult>> SettingsAsync(
        ITenantContext tenant, MemoriesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        return TypedResults.Ok(await SettingsViewAsync(db, tenant.MembershipId, clock.GetUtcNow(), cancellationToken));
    }

    /// <summary>Each parent changes only their own download permission; it never changes viewing.</summary>
    private static async Task<Results<Ok<MemorySettingsView>, ValidationProblem, ForbidHttpResult>> SaveSettingsAsync(
        MemorySettingsRequest request,
        HttpContext http,
        ITenantContext tenant,
        MemoriesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.AllowCoParentDownload is not { } allow)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(MemorySettingsRequest.AllowCoParentDownload)] = ["Say whether your co-parent can download your shared photos."],
            });
        }

        var now = clock.GetUtcNow();
        var settings = await db.Settings.SingleOrDefaultAsync(s => s.MembershipId == tenant.MembershipId, cancellationToken);
        if (settings?.AllowCoParentDownload != allow)
        {
            if (settings is null)
            {
                db.Settings.Add(new MemorySettings { FamilyId = tenant.FamilyId, MembershipId = tenant.MembershipId, AllowCoParentDownload = allow, UpdatedAt = now });
            }
            else
            {
                settings.AllowCoParentDownload = allow;
                settings.UpdatedAt = now;
            }

            await unitOfWork.ExecuteAsync(async ct =>
            {
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(new AuditEntry(
                    tenant.FamilyId, http.User.GetUserId(), allow ? "memory_downloads.allowed" : "memory_downloads.disallowed", "membership", tenant.MembershipId), ct);
            }, cancellationToken);

            // The save joined the committed transaction; let go of it before reading again.
            await db.Database.UseTransactionAsync(null, cancellationToken);
        }

        return TypedResults.Ok(await SettingsViewAsync(db, tenant.MembershipId, now, cancellationToken));
    }

    private static async Task<MemorySettingsView> SettingsViewAsync(MemoriesDbContext db, Guid membershipId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var allow = await db.Settings.AnyAsync(s => s.MembershipId == membershipId && s.AllowCoParentDownload, cancellationToken);
        var used = await Counted(db, membershipId, now).SumAsync(p => p.PhotoBytes + p.ThumbnailBytes, cancellationToken);
        return new MemorySettingsView(allow, used, PhotoRules.StorageAllowanceBytes);
    }

    /// <summary>
    /// Active, unexpired photos the viewer may see: their own, and the co-parent's while that batch is shared.
    /// </summary>
    private static IQueryable<VisiblePhoto> Visible(MemoriesDbContext db, Guid viewer, DateTimeOffset now) =>
        db.Photos
            .Where(p => p.State == PhotoState.Active && p.ExpiresAt > now)
            .Join(db.Batches, p => p.BatchId, b => b.Id, (p, b) => new VisiblePhoto { Photo = p, Batch = b })
            .Where(x => x.Batch.UploaderMembershipId == viewer || x.Batch.VisibleToCoParent);

    /// <summary>A parent's photos that hold a spot and storage: being uploaded or active, and not yet expired.</summary>
    private static IQueryable<EventPhoto> Counted(MemoriesDbContext db, Guid uploader, DateTimeOffset now) =>
        db.Photos.Where(p => p.UploaderMembershipId == uploader && _counted.Contains(p.State) && p.ExpiresAt > now);

    /// <summary>Which of these uploaders allow the co-parent to download their shared photos.</summary>
    private static async Task<IReadOnlySet<Guid>> DownloadAllowedAsync(MemoriesDbContext db, IEnumerable<Guid> uploaders, CancellationToken cancellationToken)
    {
        var ids = uploaders.Distinct().ToList();
        return (await db.Settings
                .Where(s => ids.Contains(s.MembershipId) && s.AllowCoParentDownload)
                .Select(s => s.MembershipId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    private static async Task<UploadsView> UploadsAsync(
        MemoriesDbContext db,
        PhotoEvent photoEvent,
        Guid viewer,
        IReadOnlySet<Guid> parents,
        IPhotoStore store,
        EventPhotoOptions options,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var block = PhotoRules.Block(photoEvent, viewer, parents, now);
        var cap = PhotoRules.Cap(photoEvent, viewer, parents);
        var used = await Counted(db, viewer, now).CountAsync(p => p.EventId == photoEvent.Id, cancellationToken);
        var storage = await Counted(db, viewer, now).SumAsync(p => p.PhotoBytes + p.ThumbnailBytes, cancellationToken);
        return new UploadsView(
            options.UploadsEnabled && store.IsConfigured,
            block is { } reason ? Reason(reason) : null,
            cap,
            used,
            Math.Max(0, cap - used),
            storage,
            PhotoRules.StorageAllowanceBytes,
            PhotoBatch.MaxPhotos,
            EventPhotoImages.MaxSourceBytes);
    }

    private sealed record BatchChoice(Guid Id, IResult? Refusal);

    /// <summary>The batch this upload joins: the one named, if it's the viewer's, on this event, open and not full; or a new one.</summary>
    private static async Task<BatchChoice> BatchForUploadAsync(
        MemoriesDbContext db, Guid? batchId, Guid eventId, ITenantContext tenant, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (batchId is not { } id)
        {
            var batch = new PhotoBatch { FamilyId = tenant.FamilyId, EventId = eventId, UploaderMembershipId = tenant.MembershipId, CreatedAt = now };
            db.Batches.Add(batch);
            return new BatchChoice(batch.Id, null);
        }

        var existing = await db.Batches.SingleOrDefaultAsync(
            b => b.Id == id && b.EventId == eventId && b.UploaderMembershipId == tenant.MembershipId, cancellationToken);
        if (existing is null)
        {
            return new BatchChoice(id, TypedResults.NotFound());
        }

        if (now - existing.CreatedAt > PhotoBatch.OpenFor)
        {
            return new BatchChoice(id, Problem(StatusCodes.Status409Conflict, "batch-closed", "Start a new upload to add more photos."));
        }

        var inBatch = await db.Photos.CountAsync(p => p.BatchId == id && p.State != PhotoState.Deleted, cancellationToken);
        return inBatch >= PhotoBatch.MaxPhotos
            ? new BatchChoice(id, Problem(StatusCodes.Status409Conflict, "batch-full", $"Add up to {PhotoBatch.MaxPhotos} photos at a time."))
            : new BatchChoice(id, null);
    }

    /// <summary>Gives back a reservation whose files couldn't be written.</summary>
    private static async Task ReleaseAsync(MemoriesDbContext db, IPhotoStore store, EventPhoto photo, CancellationToken cancellationToken)
    {
        await TryDeleteFilesAsync(store, photo);
        db.Photos.Remove(photo);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The cleanup releases abandoned reservations anyway.
        }
    }

    private static async Task TryDeleteFilesAsync(IPhotoStore store, EventPhoto photo)
    {
        try
        {
            await store.DeleteAsync(photo.PhotoPath, CancellationToken.None);
            await store.DeleteAsync(photo.ThumbnailPath, CancellationToken.None);
        }
#pragma warning disable CA1031 // The cleanup retries; the parent's action already succeeded.
        catch (Exception)
#pragma warning restore CA1031
        {
            // Left for the cleanup.
        }
    }

    /// <summary>A stable 32-bit key for an uploader's advisory lock. Collisions only make two parents wait for each other.</summary>
    private static int LockKey(Guid membershipId)
    {
        Span<byte> bytes = stackalloc byte[16];
        membershipId.TryWriteBytes(bytes);
        return BitConverter.ToInt32(bytes[..4]) ^ BitConverter.ToInt32(bytes[4..8]) ^ BitConverter.ToInt32(bytes[8..12]) ^ BitConverter.ToInt32(bytes[12..]);
    }

    private static PhotoView View(Guid familyId, EventPhoto photo, bool downloads)
    {
        var url = PhotoUrl(familyId, photo.Id);
        return new PhotoView(photo.Id, photo.Position, photo.Width, photo.Height, photo.ExpiresAt, url + "/thumbnail", url, downloads ? url + "/download" : null);
    }

    /// <summary>
    /// "2026-10-12 Soccer final 01 3f9a2c.webp": the event's date (UTC) and title, the photo's place in its batch and a
    /// short piece of its id so names never clash. Safe on every file system.
    /// </summary>
    internal static string DownloadName(string title, DateTimeOffset date, EventPhoto photo)
    {
        var safe = new StringBuilder();
        foreach (var c in title)
        {
            safe.Append(char.IsLetterOrDigit(c) || c is ' ' or '-' or '_' ? c : ' ');
        }

        var name = string.Join(' ', safe.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
        if (name.Length > 60)
        {
            name = name[..60].TrimEnd();
        }

        if (name.Length == 0)
        {
            name = "Photo";
        }

        return string.Create(
            CultureInfo.InvariantCulture, $"{date.UtcDateTime:yyyy-MM-dd} {name} {photo.Position:00} {photo.Id.ToString("N")[..6]}.webp");
    }

    /// <summary>The body, or null when it is bigger than an upload may be.</summary>
    private static async Task<byte[]?> ReadUploadAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > EventPhotoImages.MaxSourceBytes)
        {
            return null;
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > EventPhotoImages.MaxSourceBytes)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private static string Reason(UploadBlock block) => block switch
    {
        UploadBlock.NotConfirmed => "not-confirmed",
        UploadBlock.UnavailableTime => "unavailable-time",
        UploadBlock.NotCaregiver => "not-caregiver",
        UploadBlock.NotStarted => "not-started",
        _ => "window-closed",
    };

    private static ProblemHttpResult Blocked(UploadBlock block) => Problem(StatusCodes.Status409Conflict, Reason(block), block switch
    {
        UploadBlock.NotConfirmed => "Photos can be added once this event is confirmed.",
        UploadBlock.UnavailableTime => "Unavailable time doesn't take photos.",
        UploadBlock.NotCaregiver => "Only the parent who has the kids during this parenting time can add photos.",
        UploadBlock.NotStarted => "Photos can be added once this event starts.",
        _ => "It's been more than 28 days since this event, so photos can't be added any more.",
    });

    private static ProblemHttpResult Rejected(PhotoRejection rejection)
    {
        var (status, reason, title) = rejection switch
        {
            PhotoRejection.TooLarge => (StatusCodes.Status413PayloadTooLarge, "too-large", "This photo is over 20 MB. Choose a smaller one."),
            PhotoRejection.Heic => (StatusCodes.Status415UnsupportedMediaType, "heic", "HEIC photos aren't supported yet. Choose it from your photo library so it's added as a JPEG, or export it as a JPEG."),
            PhotoRejection.Raw => (StatusCodes.Status415UnsupportedMediaType, "raw", "RAW photos (DNG) aren't supported. Export it as a JPEG and add that instead."),
            PhotoRejection.Animated => (StatusCodes.Status415UnsupportedMediaType, "animated", "Choose a still photo, not an animation."),
            PhotoRejection.TooManyPixels => (StatusCodes.Status400BadRequest, "too-many-pixels", "That picture is too big. Choose a smaller photo."),
            PhotoRejection.ProcessedTooLarge => (StatusCodes.Status400BadRequest, "processed-too-large", "That photo couldn't be made small enough to store. Try another one."),
            PhotoRejection.Empty => (StatusCodes.Status400BadRequest, "empty", "Choose a photo to add."),
            PhotoRejection.Damaged => (StatusCodes.Status400BadRequest, "damaged", "That photo couldn't be read. Try another one."),
            _ => (StatusCodes.Status415UnsupportedMediaType, "unsupported", "Choose a JPEG, PNG or WebP photo."),
        };
        return Problem(status, reason, title);
    }

    private static ProblemHttpResult Problem(int status, string reason, string title) =>
        TypedResults.Problem(title: title, statusCode: status, extensions: new Dictionary<string, object?> { ["reason"] = reason });

    [LoggerMessage(Level = LogLevel.Warning, Message = "An event photo couldn't be written to storage")]
    private static partial void LogStorageFailed(ILogger logger, Exception exception);
}

/// <summary>A photo with its batch, for visibility queries.</summary>
internal sealed class VisiblePhoto
{
    public required EventPhoto Photo { get; init; }

    public required PhotoBatch Batch { get; init; }
}
