using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>
/// A photo the viewer may see: <c>Kind</c> "parent" with a membership id, or "child" with a child id. The URL is
/// private: every read checks the viewer again.
/// </summary>
internal sealed record PhotoRef(string Kind, Guid Id, string Url);

/// <summary>The photos this viewer sees, and who the viewer is (<c>YouKind</c>, <c>YouId</c>) for their own photo.</summary>
internal sealed record PhotoSet(string YouKind, Guid YouId, IReadOnlyList<PhotoRef> Photos);

/// <summary>
/// Profile photos (#388, #653), edited only from Settings in the app:
/// <list type="bullet">
/// <item>A parent sets their own photo, which both parents see. Only they can change it.</item>
/// <item>Each child has one family photo that both parents share (#653). Either parent may choose, replace or remove
/// it, with equal authority; the audit log records who did. The child's own photo is never substituted for it.</item>
/// <item>A signed-in child sets their own photo, which they see and which the shared-device picker shows.</item>
/// </list>
/// Uploads are raw image bodies (JPEG, PNG or WebP) processed by <see cref="AvatarImages"/>. Photos are stored in the
/// family's database rows, served only through these endpoints, and never through public URLs.
/// </summary>
internal static class PhotoEndpoints
{
    public const string UploadRateLimitPolicy = "profile-photo-upload";

    private static readonly string[] _filter = [TenantContext.QueryFilterName];

    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        var photos = family.MapGroup("/photos").WithTags("Profile photos");
        photos.MapGet("/", ListAsync).WithMetadata(new ChildSessionAllowed());
        photos.MapGet("/{photoId:guid}", ReadAsync).WithMetadata(new ChildSessionAllowed());
        photos.MapPut("/me", SetOwnAsync).WithMetadata(new ChildSessionAllowed()).RequireRateLimiting(UploadRateLimitPolicy);
        photos.MapDelete("/me", RemoveOwnAsync).WithMetadata(new ChildSessionAllowed());
        photos.MapPut("/children/{childId:guid}", SetForChildAsync).RequireRateLimiting(UploadRateLimitPolicy);
        photos.MapDelete("/children/{childId:guid}", RemoveForChildAsync);

        api.MapGet("/device/photos/{photoId:guid}", ReadOnDeviceAsync).WithTags("Profile picker").AllowAnonymous();
    }

    public static string FamilyUrl(Guid familyId, Guid photoId) => $"/api/families/{familyId}/photos/{photoId}";

    public static string DeviceUrl(Guid photoId) => $"/api/device/photos/{photoId}";

    /// <summary>
    /// The photos this viewer sees. A parent: each active parent's own photo, plus the shared family photo of each
    /// active child. A child: their own photo.
    /// </summary>
    private static async Task<Ok<PhotoSet>> ListAsync(ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role == FamilyRole.Child)
        {
            var own = await db.ProfilePhotos
                .Where(p => p.ChooserKind == PhotoChooser.Child && p.ChooserId == tenant.MembershipId && p.SubjectId == tenant.MembershipId)
                .Select(p => p.Id)
                .ToListAsync(cancellationToken);
            return TypedResults.Ok(new PhotoSet(
                "child", tenant.MembershipId, own.Select(id => new PhotoRef("child", tenant.MembershipId, FamilyUrl(tenant.FamilyId, id))).ToList()));
        }

        var parents = db.Memberships.Where(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active).Select(m => m.Id);
        var children = db.Children.Where(c => c.Status == ChildStatus.Active).Select(c => c.Id);
        var parentPhotos = await db.ProfilePhotos
            .Where(p => p.ChooserKind == PhotoChooser.Parent && p.ChooserId == p.SubjectId && parents.Contains(p.ChooserId))
            .Select(p => new { p.Id, p.SubjectId })
            .ToListAsync(cancellationToken);
        // Photos chosen before #653 were per parent, so a child can still have one from each parent: the newest is the
        // family photo, and the next change by either parent clears the older one.
        var childPhotos = (await db.ProfilePhotos
                .Where(p => p.ChooserKind == PhotoChooser.Parent && p.ChooserId != p.SubjectId && children.Contains(p.SubjectId))
                .Select(p => new { p.Id, p.SubjectId, p.CreatedAt })
                .ToListAsync(cancellationToken))
            .GroupBy(p => p.SubjectId)
            .Select(g => g.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id).First())
            .ToList();

        return TypedResults.Ok(new PhotoSet(
            "parent",
            tenant.MembershipId,
            parentPhotos.Select(p => new PhotoRef("parent", p.SubjectId, FamilyUrl(tenant.FamilyId, p.Id)))
                .Concat(childPhotos.Select(p => new PhotoRef("child", p.SubjectId, FamilyUrl(tenant.FamilyId, p.Id))))
                .ToList()));
    }

    /// <summary>One photo, only when this viewer may see it; anything else answers 404, so guessed ids learn nothing.</summary>
    private static async Task<IResult> ReadAsync(
        Guid photoId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        var photo = await db.ProfilePhotos
            .Where(p => p.Id == photoId)
            .Select(p => new { p.ChooserKind, p.ChooserId, p.SubjectId })
            .SingleOrDefaultAsync(cancellationToken);
        var allowed = photo is not null && tenant.Role switch
        {
            FamilyRole.Child => photo.ChooserKind == PhotoChooser.Child && photo.ChooserId == tenant.MembershipId && photo.SubjectId == tenant.MembershipId,
            FamilyRole.Parent => photo.ChooserKind == PhotoChooser.Parent
                && (photo.ChooserId == tenant.MembershipId
                    || (photo.ChooserId == photo.SubjectId
                        ? await db.Memberships.AnyAsync(
                            m => m.Id == photo.ChooserId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, cancellationToken)
                        : await db.Children.AnyAsync(c => c.Id == photo.SubjectId, cancellationToken))),
            _ => false,
        };

        return allowed ? await ServeAsync(http, db.ProfilePhotos.Where(p => p.Id == photoId), photoId, cancellationToken) : TypedResults.NotFound();
    }

    /// <summary>
    /// A photo on the shared-device picker or a PIN screen, read with this browser's device cookie only: the device
    /// owner's own photo on a shared household device, and for each child this device shows, the child's own photo or
    /// the family photo both parents share (#653). Revoked or expired devices and other families' photos answer 404.
    /// </summary>
    private static async Task<IResult> ReadOnDeviceAsync(
        Guid photoId, HttpContext http, FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (await SharedDevices.FindByCookieAsync(http, db, clock.GetUtcNow(), cancellationToken) is not { } device)
        {
            return TypedResults.NotFound();
        }

        var photos = db.ProfilePhotos.IgnoreQueryFilters(_filter).Where(p => p.Id == photoId && p.FamilyId == device.FamilyId);
        var photo = await photos.Select(p => new { p.ChooserKind, p.ChooserId, p.SubjectId }).SingleOrDefaultAsync(cancellationToken);
        if (photo is null)
        {
            return TypedResults.NotFound();
        }

        // A parent's own photo (chooser and subject the same membership), or any photo of a child: the child's own, or
        // the family photo the parents share.
        var allowed = photo.ChooserKind == PhotoChooser.Parent && photo.ChooserId == photo.SubjectId
            ? device.Kind == DeviceKind.Household
                && await SharedDevices.OwnerAsync(db, device, null, cancellationToken) is { } owner
                && owner.Id == photo.ChooserId
            : (photo.ChooserKind == PhotoChooser.Parent || photo.ChooserId == photo.SubjectId)
                && (device.Kind == DeviceKind.Household || device.ChildProfileId == photo.SubjectId)
                && await db.Children.IgnoreQueryFilters(_filter).AnyAsync(
                    c => c.Id == photo.SubjectId && c.FamilyId == device.FamilyId && c.Status == ChildStatus.Active, cancellationToken);

        return allowed ? await ServeAsync(http, photos, photoId, cancellationToken) : TypedResults.NotFound();
    }

    /// <summary>
    /// Sends the bytes. Ids change whenever a photo is replaced, so the id is the ETag; browsers still check back each
    /// time (<c>no-cache</c>), so lost access takes effect at once.
    /// </summary>
    private static async Task<IResult> ServeAsync(
        HttpContext http, IQueryable<ProfilePhoto> photo, Guid photoId, CancellationToken cancellationToken)
    {
        var etag = new EntityTagHeaderValue($"\"{photoId:N}\"");
        http.Response.Headers.CacheControl = "private, no-cache";
        http.Response.Headers.ETag = etag.ToString();
        http.Response.Headers.XContentTypeOptions = "nosniff";
        if (http.Request.Headers.IfNoneMatch.ToString() == etag.ToString())
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        var stored = await photo.Select(p => new { p.Content, p.ContentType }).SingleAsync(cancellationToken);
        return TypedResults.File(stored.Content, stored.ContentType);
    }

    /// <summary>A parent's or child's own photo. Replacing it keeps the previous one until the new one is saved.</summary>
    private static async Task<IResult> SetOwnAsync(
        HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork, IAuditLog audit, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var chooser = tenant.Role == FamilyRole.Child ? PhotoChooser.Child : PhotoChooser.Parent;
        return await SaveAsync(http, tenant, db, unitOfWork, audit, clock, chooser, tenant.MembershipId, cancellationToken);
    }

    private static async Task<IResult> RemoveOwnAsync(
        HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork, IAuditLog audit, CancellationToken cancellationToken)
    {
        var chooser = tenant.Role == FamilyRole.Child ? PhotoChooser.Child : PhotoChooser.Parent;
        return await RemoveAsync(http, tenant, db, unitOfWork, audit, chooser, tenant.MembershipId, cancellationToken);
    }

    /// <summary>
    /// The shared family photo of an active child (#653). Either parent may set it; it replaces whichever parent's
    /// photo of that child was there, for both parents.
    /// </summary>
    private static async Task<IResult> SetForChildAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork, IAuditLog audit,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await db.Children.AnyAsync(c => c.Id == childId && c.Status == ChildStatus.Active, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        return await SaveAsync(http, tenant, db, unitOfWork, audit, clock, PhotoChooser.Parent, childId, cancellationToken);
    }

    private static async Task<IResult> RemoveForChildAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork, IAuditLog audit,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        return await RemoveAsync(http, tenant, db, unitOfWork, audit, PhotoChooser.Parent, childId, cancellationToken);
    }

    private static async Task<IResult> SaveAsync(
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        PhotoChooser chooser,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        if (await ReadUploadAsync(http.Request, cancellationToken) is not { } upload)
        {
            return Refused(AvatarRejection.TooLarge);
        }

        var processed = AvatarImages.Process(upload);
        if (processed.Rejection is { } rejection)
        {
            return Refused(rejection);
        }

        var photo = new ProfilePhoto
        {
            FamilyId = tenant.FamilyId,
            ChooserKind = chooser,
            ChooserId = tenant.MembershipId,
            SubjectId = subjectId,
            Content = processed.Content!,
            ContentType = AvatarImages.ContentType,
            Side = processed.Side,
            CreatedAt = clock.GetUtcNow(),
        };

        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                // The previous photo goes in the same transaction as the new one arrives: a failure keeps it.
                var previous = await Existing(db, tenant, chooser, subjectId).ToListAsync(ct);
                db.ProfilePhotos.RemoveRange(previous);
                await db.SaveChangesAsync(ct);
                db.ProfilePhotos.Add(photo);
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(Audit(http, tenant, chooser, subjectId, "profile_photo.updated"), ct);
            }, cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two uploads for the same photo at once: one wins and the other changes nothing.
            return TypedResults.Problem(
                title: "Another photo change was saved at the same time.", detail: "Try again.", statusCode: StatusCodes.Status409Conflict);
        }

        var kind = SubjectKind(chooser, subjectId, tenant);
        return TypedResults.Ok(new PhotoRef(kind, subjectId, FamilyUrl(tenant.FamilyId, photo.Id)));
    }

    private static async Task<IResult> RemoveAsync(
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        PhotoChooser chooser,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var existing = await Existing(db, tenant, chooser, subjectId).ToListAsync(cancellationToken);
        if (existing.Count == 0)
        {
            return TypedResults.NoContent();
        }

        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                db.ProfilePhotos.RemoveRange(existing);
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(Audit(http, tenant, chooser, subjectId, "profile_photo.removed"), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Already removed or replaced by another request.
        }

        return TypedResults.NoContent();
    }

    /// <summary>
    /// The photo a change replaces or removes: the viewer's own photo, or a child's shared family photo whichever parent
    /// chose it (#653).
    /// </summary>
    private static IQueryable<ProfilePhoto> Existing(FamiliesDbContext db, ITenantContext tenant, PhotoChooser chooser, Guid subjectId) =>
        chooser == PhotoChooser.Parent && subjectId != tenant.MembershipId
            ? db.ProfilePhotos.Where(p => p.ChooserKind == PhotoChooser.Parent && p.SubjectId == subjectId && p.ChooserId != subjectId)
            : db.ProfilePhotos.Where(p => p.ChooserKind == chooser && p.ChooserId == tenant.MembershipId && p.SubjectId == subjectId);

    private static string SubjectKind(PhotoChooser chooser, Guid subjectId, ITenantContext tenant) =>
        chooser == PhotoChooser.Parent && subjectId == tenant.MembershipId ? "parent" : "child";

    private static AuditEntry Audit(HttpContext http, ITenantContext tenant, PhotoChooser chooser, Guid subjectId, string action) =>
        new(tenant.FamilyId, http.User.GetUserId(), action, SubjectKind(chooser, subjectId, tenant) == "parent" ? "membership" : "child", subjectId);

    /// <summary>The request body, or null when it is bigger than an upload may be.</summary>
    private static async Task<byte[]?> ReadUploadAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > AvatarImages.MaxUploadBytes)
        {
            return null;
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > AvatarImages.MaxUploadBytes)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private static ProblemHttpResult Refused(AvatarRejection rejection)
    {
        var (status, reason, title) = rejection switch
        {
            AvatarRejection.TooLarge => (StatusCodes.Status413PayloadTooLarge, "too-large", $"Choose a photo smaller than {AvatarImages.MaxUploadBytes / 1024 / 1024} MB."),
            AvatarRejection.TooManyPixels => (StatusCodes.Status400BadRequest, "too-many-pixels", "That picture is too big. Choose a smaller photo."),
            AvatarRejection.Animated => (StatusCodes.Status415UnsupportedMediaType, "animated", "Choose a still photo, not an animation."),
            AvatarRejection.Empty => (StatusCodes.Status400BadRequest, "empty", "Choose a photo to upload."),
            AvatarRejection.Damaged => (StatusCodes.Status400BadRequest, "damaged", "That photo couldn't be read. Try another one."),
            _ => (StatusCodes.Status415UnsupportedMediaType, "unsupported", "Choose a JPEG, PNG or WebP photo."),
        };
        return TypedResults.Problem(
            title: title, statusCode: status, extensions: new Dictionary<string, object?> { ["reason"] = reason });
    }
}
