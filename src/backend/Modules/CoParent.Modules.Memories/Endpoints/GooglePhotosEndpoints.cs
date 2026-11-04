using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CoParent.Infrastructure.Email;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.Memories.Domain;
using CoParent.Modules.Memories.Infrastructure;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Memories.Endpoints;

internal enum GooglePhotosState
{
    NotConnected,
    Connected,
    NeedsReconnect,
}

/// <param name="Available">False when the feature isn't set up on this server: the app explains and offers nothing.</param>
/// <param name="State">Whether this parent's Google Photos is connected, needs reconnecting, or was never connected.</param>
/// <param name="Problem">Why a connection needs reconnecting.</param>
/// <param name="ConnectedAt">When this parent last connected.</param>
/// <param name="ExportedCount">Photos this connection has put in their Google Photos.</param>
/// <param name="AlbumCount">Albums this connection made.</param>
/// <param name="WaitingCount">Photos queued or being checked.</param>
/// <param name="ReturnEventId">After connecting: the memory the parent started from, to go back to.</param>
internal sealed record GooglePhotosView(
    bool Available,
    GooglePhotosState State,
    GooglePhotosProblem Problem,
    DateTimeOffset? ConnectedAt,
    int ExportedCount,
    int AlbumCount,
    int WaitingCount,
    Guid? ReturnEventId);

/// <param name="ReturnEventId">The memory the parent started from, if any. Carried inside the encrypted state.</param>
internal sealed record GooglePhotosAuthorizeRequest(Guid? ReturnEventId);

internal sealed record GooglePhotosAuthorizeView(Uri Url);

/// <param name="Code">The authorization code Google added to the callback URL.</param>
/// <param name="State">The state Google echoed back, as this server issued it.</param>
internal sealed record GooglePhotosConnectRequest(string? Code, string? State);

/// <summary>One photo's export, for the viewer's own connection.</summary>
internal sealed record PhotoExportView(Guid PhotoId, PhotoExportState State, PhotoExportReason Reason, DateTimeOffset UpdatedAt);

/// <summary>
/// What exporting this memory would do, and how far it got. <c>Exportable</c>: photos the viewer may download that
/// aren't exported or waiting. <c>Omitted</c>: photos the viewer can see but not download (never named, so the
/// co-parent's private photos stay invisible). <c>Photos</c>: this connection's export records for the event.
/// </summary>
internal sealed record EventExportView(
    bool Available,
    GooglePhotosState Connection,
    string AlbumTitle,
    int Exportable,
    int Exported,
    int Waiting,
    int Omitted,
    IReadOnlyList<PhotoExportView> Photos);

/// <param name="PhotoIds">The photos to export; null or missing exports every photo the viewer may download.</param>
internal sealed record ExportRequest(IReadOnlyList<Guid>? PhotoIds);

/// <summary>
/// Google Photos export (#404). Parents only, and only ever for themselves: one parent connecting, exporting or
/// disconnecting never changes anything for the co-parent. A parent may export a photo exactly when they may download
/// it (the #403 rule); the worker checks again before sending and before adding it to the album. Connecting is the
/// OAuth code flow with PKCE; the state is encrypted, expires after ten minutes and is bound to this parent in this
/// family. Nothing is read from Google.
/// </summary>
internal static class GooglePhotosEndpoints
{
    public const string StatePurpose = "CoParent.Memories.GooglePhotos.OAuthState.v1";
    public static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(10);
    private const int MaxCodeLength = 2048;
    private const int MaxStateLength = 4096;
    private const int MaxPhotoIds = 100;

    public static void Map(IEndpointRouteBuilder family)
    {
        var google = family.MapGroup("/memories/google-photos").WithTags("Family Memories");
        google.MapGet("/", GetAsync);
        google.MapPost("/authorize", Authorize);
        google.MapPost("/connect", ConnectAsync);
        google.MapDelete("/", DisconnectAsync);

        var exports = family.MapGroup("/memories/events/{eventId:guid}/google-photos").WithTags("Family Memories");
        exports.MapGet("/", EventExportAsync);
        exports.MapPost("/", ExportAsync);
    }

    private static async Task<Results<Ok<GooglePhotosView>, ForbidHttpResult>> GetAsync(
        ITenantContext tenant, MemoriesDbContext db, IOptions<GooglePhotosOptions> options, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var connection = await db.GooglePhotosConnections.AsNoTracking()
            .SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, connection, options.Value, null, cancellationToken));
    }

    private static Results<Ok<GooglePhotosAuthorizeView>, ForbidHttpResult, ProblemHttpResult> Authorize(
        GooglePhotosAuthorizeRequest? request,
        ITenantContext tenant,
        IOptions<GooglePhotosOptions> options,
        GooglePhotosClient google,
        IDataProtectionProvider protection,
        PublicUrls urls)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!options.Value.IsOn)
        {
            return Unavailable();
        }

        var verifier = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var challenge = WebEncoders.Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var state = StateProtector(protection).Protect(
            JsonSerializer.Serialize(new OAuthState(tenant.FamilyId, tenant.MembershipId, verifier, request?.ReturnEventId)), StateLifetime);
        return TypedResults.Ok(new GooglePhotosAuthorizeView(google.AuthorizeUrl(RedirectUri(urls), state, challenge)));
    }

    private static async Task<Results<Ok<GooglePhotosView>, ForbidHttpResult, ProblemHttpResult, ValidationProblem>> ConnectAsync(
        GooglePhotosConnectRequest request,
        ITenantContext tenant,
        MemoriesDbContext db,
        IOptions<GooglePhotosOptions> options,
        GooglePhotosClient google,
        GooglePhotosTokens tokens,
        GooglePhotosExportSignal signal,
        IDataProtectionProvider protection,
        PublicUrls urls,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        HttpContext http,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!options.Value.IsOn)
        {
            return Unavailable();
        }

        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Length > MaxCodeLength
            || string.IsNullOrWhiteSpace(request.State) || request.State.Length > MaxStateLength
            || ReadState(protection, request.State) is not { } state
            || state.FamilyId != tenant.FamilyId || state.MembershipId != tenant.MembershipId)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["state"] = ["This Google sign-in link has expired or isn't yours. Start again from Settings."],
            });
        }

        GooglePhotosGrant granted;
        try
        {
            granted = await google.ExchangeCodeAsync(request.Code, state.Verifier, RedirectUri(urls), cancellationToken);
        }
        catch (GooglePhotosException exception) when (exception.Failure == GooglePhotosFailure.Revoked)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["code"] = ["This Google sign-in link has expired or was already used. Start again from Settings."],
            });
        }
        catch (Exception exception) when (exception is GooglePhotosException or HttpRequestException or TaskCanceledException)
        {
            return GoogleUnreachable();
        }

        if (granted.RefreshToken is not { Length: > 0 } || !Granted(granted.Scope))
        {
            // The parent unticked Photos access on Google's consent page, or Google sent no refresh token.
            await TryRevokeAsync(google, granted.RefreshToken ?? granted.AccessToken);
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["code"] = ["Google didn't give Parenthesis access to add photos. Try again and allow Google Photos access."],
            });
        }

        var now = clock.GetUtcNow();
        var connection = await db.GooglePhotosConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        var previousToken = connection?.ProtectedRefreshToken;
        if (connection is null)
        {
            connection = new GooglePhotosConnection
            {
                FamilyId = tenant.FamilyId,
                MembershipId = tenant.MembershipId,
                ProtectedRefreshToken = tokens.Protect(granted.RefreshToken),
            };
            db.GooglePhotosConnections.Add(connection);
        }
        else
        {
            // Reconnecting, perhaps to another Google account: Parenthesis can't see which, so earlier albums and
            // "exported" marks no longer count. Photos still waiting are sent to the account connected now.
            connection.ProtectedRefreshToken = tokens.Protect(granted.RefreshToken);
            db.GooglePhotosAlbums.RemoveRange(await db.GooglePhotosAlbums.Where(a => a.ConnectionId == connection.Id).ToListAsync(cancellationToken));
            var exports = await db.PhotoExports.Where(e => e.ConnectionId == connection.Id).ToListAsync(cancellationToken);
            db.PhotoExports.RemoveRange(exports.Where(e => !e.Waiting));
            foreach (var waiting in exports.Where(e => e.Waiting))
            {
                waiting.Requeue(now);
                (waiting.UploadToken, waiting.UploadTokenExpiresAt) = (null, null);
            }
        }

        (connection.Status, connection.Problem, connection.ConnectedAt) = (GooglePhotosStatus.Active, GooglePhotosProblem.None, now);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(
                new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "google_photos.connected", "google_photos_connection", connection.Id), ct);
        }, cancellationToken);
        await db.Database.UseTransactionAsync(null, cancellationToken);
        tokens.Remember(connection.Id, granted);

        if (previousToken is not null)
        {
            await TryRevokeAsync(google, TryUnprotect(tokens, previousToken));
        }

        signal.Poke();
        return TypedResults.Ok(await ViewAsync(db, connection, options.Value, state.ReturnEventId, cancellationToken));
    }

    /// <summary>
    /// Forgets the grant, the albums and every export record, cancelling anything still waiting. Albums and photos
    /// already in Google stay there: Parenthesis never deletes from the parent's library.
    /// </summary>
    private static async Task<Results<NoContent, ForbidHttpResult>> DisconnectAsync(
        ITenantContext tenant,
        MemoriesDbContext db,
        GooglePhotosClient google,
        GooglePhotosTokens tokens,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var connection = await db.GooglePhotosConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        if (connection is null)
        {
            return TypedResults.NoContent();
        }

        await TryRevokeAsync(google, TryUnprotect(tokens, connection.ProtectedRefreshToken));
        tokens.Forget(connection.Id);
        db.GooglePhotosConnections.Remove(connection);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(
                new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "google_photos.disconnected", "google_photos_connection", connection.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>What exporting this memory would include, and each photo's export so far. Polled while the memory is open.</summary>
    private static async Task<Results<Ok<EventExportView>, NotFound, ForbidHttpResult>> EventExportAsync(
        Guid eventId,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar calendar,
        IFamilyRoster roster,
        IOptions<GooglePhotosOptions> options,
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

        return TypedResults.Ok(await EventViewAsync(db, roster, options.Value, tenant.MembershipId, photoEvent, clock.GetUtcNow(), cancellationToken));
    }

    /// <summary>
    /// Queues photos from this memory for the viewer's Google Photos: the ones named, or every one they may download.
    /// Photos they may not download are ignored. Already exported or waiting photos aren't queued again (no re-export
    /// in M3, owner decision November 4, 2026); failed or skipped ones are retried.
    /// </summary>
    private static async Task<IResult> ExportAsync(
        Guid eventId,
        ExportRequest request,
        ITenantContext tenant,
        MemoriesDbContext db,
        IEventPhotoCalendar calendar,
        IFamilyRoster roster,
        IOptions<GooglePhotosOptions> options,
        GooglePhotosExportSignal signal,
        IUnitOfWork unitOfWork,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!options.Value.IsOn)
        {
            return Unavailable();
        }

        if (request.PhotoIds is { Count: > MaxPhotoIds })
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(ExportRequest.PhotoIds)] = [$"Choose at most {MaxPhotoIds} photos."],
            });
        }

        if (await calendar.FindAsync(eventId, cancellationToken) is not { } photoEvent || photoEvent.IsUnavailable)
        {
            return TypedResults.NotFound();
        }

        var connection = await db.GooglePhotosConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        if (connection is not { Status: GooglePhotosStatus.Active })
        {
            return TypedResults.Problem(
                title: connection is null ? "Connect Google Photos first." : "Google Photos needs you to reconnect.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["reason"] = connection is null ? "not-connected" : "reconnect" });
        }

        var now = clock.GetUtcNow();
        var wanted = request.PhotoIds?.ToHashSet();
        var downloadable = (await MemoryEndpoints.DownloadableAsync(db, tenant.MembershipId, eventId, null, now, cancellationToken))
            .Where(p => wanted is null || wanted.Contains(p.Id))
            .ToList();
        var ids = downloadable.Select(p => p.Id).ToList();
        var existing = await db.PhotoExports
            .Where(e => e.ConnectionId == connection.Id && ids.Contains(e.PhotoId))
            .ToDictionaryAsync(e => e.PhotoId, cancellationToken);

        var queued = 0;
        foreach (var photo in downloadable)
        {
            if (!existing.TryGetValue(photo.Id, out var export))
            {
                db.PhotoExports.Add(new PhotoExport
                {
                    FamilyId = tenant.FamilyId,
                    ConnectionId = connection.Id,
                    PhotoId = photo.Id,
                    EventId = eventId,
                    State = PhotoExportState.Queued,
                    NextAttemptAt = now,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
                queued++;
            }
            else if (export.State is PhotoExportState.Failed or PhotoExportState.Skipped)
            {
                export.Requeue(now);
                queued++;
            }
        }

        if (queued > 0)
        {
            try
            {
                await unitOfWork.ExecuteAsync(db.SaveChangesAsync, cancellationToken);
            }
            catch (DbUpdateException)
            {
                // A second request queued the same photos at the same moment; theirs stands.
            }

            await db.Database.UseTransactionAsync(null, cancellationToken);
            db.ChangeTracker.Clear();
            signal.Poke();
        }

        return TypedResults.Ok(await EventViewAsync(db, roster, options.Value, tenant.MembershipId, photoEvent, now, cancellationToken));
    }

    private static async Task<EventExportView> EventViewAsync(
        MemoriesDbContext db,
        IFamilyRoster roster,
        GooglePhotosOptions options,
        Guid viewer,
        PhotoEvent photoEvent,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var connection = await db.GooglePhotosConnections.AsNoTracking().SingleOrDefaultAsync(c => c.MembershipId == viewer, cancellationToken);
        var visible = await MemoryEndpoints.Visible(db, viewer, now).CountAsync(x => x.Photo.EventId == photoEvent.Id, cancellationToken);
        var downloadable = await MemoryEndpoints.DownloadableAsync(db, viewer, photoEvent.Id, null, now, cancellationToken);
        var exports = connection is null
            ? []
            : await db.PhotoExports.AsNoTracking()
                .Where(e => e.ConnectionId == connection.Id && e.EventId == photoEvent.Id)
                .OrderBy(e => e.CreatedAt)
                .ToListAsync(cancellationToken);
        var byPhoto = exports.ToDictionary(e => e.PhotoId);

        return new EventExportView(
            options.IsOn,
            State(connection),
            PhotoExportRules.AlbumTitle(photoEvent.Title, photoEvent.StartsAt, await roster.TimeZoneAsync(cancellationToken)),
            downloadable.Count(p => !byPhoto.TryGetValue(p.Id, out var e) || e.State is PhotoExportState.Failed or PhotoExportState.Skipped),
            downloadable.Count(p => byPhoto.TryGetValue(p.Id, out var e) && e.State == PhotoExportState.Exported),
            exports.Count(e => e.Waiting),
            visible - downloadable.Count,
            [.. exports.Select(e => new PhotoExportView(e.PhotoId, e.State, e.Reason, e.UpdatedAt))]);
    }

    private static async Task<GooglePhotosView> ViewAsync(
        MemoriesDbContext db, GooglePhotosConnection? connection, GooglePhotosOptions options, Guid? returnEventId, CancellationToken cancellationToken)
    {
        if (connection is null)
        {
            return new GooglePhotosView(options.IsOn, GooglePhotosState.NotConnected, GooglePhotosProblem.None, null, 0, 0, 0, returnEventId);
        }

        var exports = db.PhotoExports.Where(e => e.ConnectionId == connection.Id);
        return new GooglePhotosView(
            options.IsOn,
            State(connection),
            connection.Problem,
            connection.ConnectedAt,
            await exports.CountAsync(e => e.State == PhotoExportState.Exported, cancellationToken),
            await db.GooglePhotosAlbums.CountAsync(a => a.ConnectionId == connection.Id, cancellationToken),
            await exports.CountAsync(e => e.State == PhotoExportState.Queued || e.State == PhotoExportState.Checking, cancellationToken),
            returnEventId);
    }

    private static GooglePhotosState State(GooglePhotosConnection? connection) => connection switch
    {
        null => GooglePhotosState.NotConnected,
        { Status: GooglePhotosStatus.Active } => GooglePhotosState.Connected,
        _ => GooglePhotosState.NeedsReconnect,
    };

    private static bool Granted(string? scope) =>
        scope is null || scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(GooglePhotosOptions.Scope, StringComparer.Ordinal);

    private static Uri RedirectUri(PublicUrls urls) => urls.Build(GooglePhotosOptions.CallbackPath, new Dictionary<string, string?>());

    private static ITimeLimitedDataProtector StateProtector(IDataProtectionProvider protection) =>
        protection.CreateProtector(StatePurpose).ToTimeLimitedDataProtector();

    private static OAuthState? ReadState(IDataProtectionProvider protection, string state)
    {
        try
        {
            return JsonSerializer.Deserialize<OAuthState>(StateProtector(protection).Unprotect(state));
        }
        catch (Exception exception) when (exception is CryptographicException or JsonException or FormatException)
        {
            return null;
        }
    }

    private static string? TryUnprotect(GooglePhotosTokens tokens, string protectedToken)
    {
        try
        {
            return tokens.Unprotect(protectedToken);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private static async Task TryRevokeAsync(GooglePhotosClient google, string? token)
    {
        if (token is null)
        {
            return;
        }

        try
        {
            await google.RevokeAsync(token, CancellationToken.None);
        }
        catch (Exception exception) when (exception is GooglePhotosException or HttpRequestException or TaskCanceledException)
        {
            // Best effort: the parent can remove Parenthesis under "Third-party connections" in their Google account.
        }
    }

    private static ProblemHttpResult Unavailable() => TypedResults.Problem(
        title: "Google Photos isn't available yet.",
        detail: "Exporting to Google Photos hasn't been set up on this server.",
        statusCode: StatusCodes.Status409Conflict,
        extensions: new Dictionary<string, object?> { ["reason"] = "unavailable" });

    private static ProblemHttpResult GoogleUnreachable() => TypedResults.Problem(
        title: "Google didn't answer.",
        detail: "Parenthesis couldn't finish connecting to Google Photos. Try again in a few minutes.",
        statusCode: StatusCodes.Status502BadGateway);

    private sealed record OAuthState(Guid FamilyId, Guid MembershipId, string Verifier, Guid? ReturnEventId);
}
