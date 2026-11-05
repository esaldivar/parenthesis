using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Memories.Domain;

internal enum GooglePhotosStatus
{
    /// <summary>Exports are sent to the parent's Google Photos.</summary>
    Active,

    /// <summary>Exports wait (see <see cref="GooglePhotosProblem"/>) until the parent reconnects or disconnects.</summary>
    NeedsReconnect,
}

/// <summary>Why exports stopped. Only a code: Google's own error text is never stored.</summary>
internal enum GooglePhotosProblem
{
    None,

    /// <summary>The parent removed Parenthesis's access in their Google account, or Google expired it.</summary>
    AccessRevoked,
}

/// <summary>
/// One parent's link to their own Google Photos (#404), for one-way exports of Family Memories photos. Per parent:
/// it never changes anything for the co-parent. The refresh token is encrypted with data protection and is never
/// logged, returned to a browser or put in telemetry. Deleting the connection deletes its albums and export records.
/// </summary>
internal sealed class GooglePhotosConnection : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid MembershipId { get; init; }

    /// <summary>The refresh token, encrypted (purpose <c>GooglePhotosTokens.Purpose</c>).</summary>
    public required string ProtectedRefreshToken { get; set; }

    public GooglePhotosStatus Status { get; set; }

    public GooglePhotosProblem Problem { get; set; }

    public DateTimeOffset ConnectedAt { get; set; }

    /// <summary>PostgreSQL xmin.</summary>
    public uint Version { get; private set; }

    public void Stop(GooglePhotosProblem problem) => (Status, Problem) = (GooglePhotosStatus.NeedsReconnect, problem);
}

/// <summary>The album Parenthesis made in one parent's Google Photos for one event, the first time they exported from it.</summary>
internal sealed class GooglePhotosAlbum : IFamilyScoped
{
    /// <summary>Google's limit for an album title.</summary>
    public const int MaxTitleLength = 500;

    public Guid FamilyId { get; init; }

    public Guid ConnectionId { get; init; }

    public Guid EventId { get; init; }

    public required string GoogleAlbumId { get; set; }
}

/// <summary>Where one photo's export is. Only <see cref="Exported"/> means Google confirmed the copy.</summary>
internal enum PhotoExportState
{
    /// <summary>Waiting to be sent (again, after <see cref="PhotoExport.NextAttemptAt"/>).</summary>
    Queued,

    /// <summary>The last request timed out or failed and its result is unknown; retried the same way.</summary>
    Checking,

    /// <summary>Google created the item in the event's album.</summary>
    Exported,

    /// <summary>Not exported; <see cref="PhotoExport.Reason"/> says why. The parent can try again where that helps.</summary>
    Failed,

    /// <summary>Not sent because access, download permission or the photo changed first. Never retried on its own.</summary>
    Skipped,
}

/// <summary>Why an export isn't done yet, or didn't happen. Shown to the parent in plain words.</summary>
internal enum PhotoExportReason
{
    None,

    /// <summary>Google Photos needs the parent to reconnect.</summary>
    Reconnect,

    /// <summary>Google is limiting requests (HTTP 429, or Parenthesis's own daily guard). Retried automatically.</summary>
    RateLimited,

    /// <summary>Google failed or refused it. The parent can try again.</summary>
    GoogleError,

    /// <summary>Google says the parent's storage is full.</summary>
    StorageFull,

    /// <summary>The viewer may no longer download it: sharing or the uploader's download permission changed.</summary>
    NotAllowed,

    /// <summary>The photo was deleted.</summary>
    Deleted,

    /// <summary>The photo expired before it was exported.</summary>
    Expired,
}

/// <summary>
/// One photo queued for, or sent to, one parent's Google Photos (#404). Unique per connection and photo, so repeated
/// requests never queue a photo twice. The upload token is kept for Google's one-day lifetime, so a retry after a
/// failed <c>batchCreate</c> reuses the uploaded bytes instead of sending them again.
/// </summary>
internal sealed class PhotoExport : Entity, IFamilyScoped
{
    /// <summary>Transient failures in a row before an export is marked failed for the parent to retry.</summary>
    public const int MaxAttempts = 5;

    public Guid FamilyId { get; init; }

    public Guid ConnectionId { get; init; }

    public Guid PhotoId { get; init; }

    public Guid EventId { get; init; }

    public PhotoExportState State { get; set; }

    public PhotoExportReason Reason { get; set; }

    /// <summary>Google's token for bytes already uploaded; usable until <see cref="UploadTokenExpiresAt"/>.</summary>
    public string? UploadToken { get; set; }

    public DateTimeOffset? UploadTokenExpiresAt { get; set; }

    public string? GoogleMediaItemId { get; set; }

    public int Attempts { get; set; }

    public DateTimeOffset NextAttemptAt { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>PostgreSQL xmin.</summary>
    public uint Version { get; private set; }

    public bool Waiting => State is PhotoExportState.Queued or PhotoExportState.Checking;

    /// <summary>Queues it again from the start (a parent's retry): attempts reset, any still-valid upload token kept.</summary>
    public void Requeue(DateTimeOffset now)
    {
        (State, Reason, Attempts, NextAttemptAt, UpdatedAt) = (PhotoExportState.Queued, PhotoExportReason.None, 0, now, now);
    }

    public void Finish(PhotoExportState state, PhotoExportReason reason, DateTimeOffset now)
    {
        (State, Reason, UpdatedAt) = (state, reason, now);
        if (state != PhotoExportState.Queued && state != PhotoExportState.Checking)
        {
            (UploadToken, UploadTokenExpiresAt) = (null, null);
        }
    }

    /// <summary>
    /// A transient failure: waits and tries again, backing off, and gives up after <see cref="MaxAttempts"/>.
    /// <paramref name="ambiguous"/> means Google may have done it; the retry repeats the same request.
    /// </summary>
    public void RetryLater(PhotoExportReason reason, bool ambiguous, TimeSpan minimumDelay, DateTimeOffset now)
    {
        Attempts++;
        if (Attempts >= MaxAttempts)
        {
            Finish(PhotoExportState.Failed, PhotoExportReason.GoogleError, now);
            return;
        }

        var backoff = TimeSpan.FromSeconds(Math.Pow(2, Attempts) * 15);
        (State, Reason, UpdatedAt) = (ambiguous ? PhotoExportState.Checking : PhotoExportState.Queued, reason, now);
        NextAttemptAt = now + (backoff > minimumDelay ? backoff : minimumDelay);
    }
}
