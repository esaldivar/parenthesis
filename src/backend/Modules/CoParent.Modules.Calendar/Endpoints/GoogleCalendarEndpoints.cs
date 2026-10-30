using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CoParent.Infrastructure.Email;
using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Infrastructure;
using CoParent.Modules.Families.Contracts;
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

namespace CoParent.Modules.Calendar.Endpoints;

internal enum GoogleCalendarState
{
    NotConnected,
    Connected,
    NeedsReconnect,
}

/// <param name="Available">False when the feature isn't set up on this server: Settings explains and offers nothing.</param>
/// <param name="State">Whether this parent's copy is running, stopped, or was never set up.</param>
/// <param name="Problem">Why a stopped copy stopped.</param>
/// <param name="CalendarName">The calendar's name in Google Calendar.</param>
/// <param name="ConnectedAt">When this parent last connected.</param>
/// <param name="LastSyncedAt">When the last copy pass finished; null until the first one.</param>
/// <param name="CopyTypes">The kinds of event this parent copies; the defaults until they connect.</param>
internal sealed record GoogleCalendarView(
    bool Available,
    GoogleCalendarState State,
    GoogleConnectionProblem Problem,
    string CalendarName,
    DateTimeOffset? ConnectedAt,
    DateTimeOffset? LastSyncedAt,
    IReadOnlyList<GoogleCopyType> CopyTypes);

/// <param name="CopyTypes">Every kind of event to copy from now on. Empty copies nothing but stays connected.</param>
internal sealed record GoogleCopyTypesRequest(IReadOnlyList<GoogleCopyType>? CopyTypes);

internal sealed record GoogleAuthorizeView(Uri Url);

/// <param name="Code">The authorization code Google added to the callback URL.</param>
/// <param name="State">The state Google echoed back, as this server issued it.</param>
internal sealed record GoogleConnectRequest(string? Code, string? State);

/// <summary>
/// A parent's own Google Calendar copy (#386), under Settings. Parents only, and only ever for themselves: one parent
/// connecting or disconnecting never changes anything for the co-parent or the children. Nothing is read from
/// Google. Connecting is the OAuth code flow with PKCE; the state is encrypted, expires after ten minutes and is
/// bound to this parent in this family, so a callback link can't be replayed into someone else's account.
/// </summary>
internal static class GoogleCalendarEndpoints
{
    public const string StatePurpose = "CoParent.Calendar.GoogleCalendar.OAuthState.v1";
    public static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(10);
    private const int MaxCodeLength = 2048;
    private const int MaxStateLength = 4096;

    public static void Map(IEndpointRouteBuilder family)
    {
        var google = family.MapGroup("/google-calendar").WithTags("Calendar");
        google.MapGet("/", GetAsync);
        google.MapPost("/authorize", Authorize);
        google.MapPost("/connect", ConnectAsync);
        google.MapPut("/copy-types", SetCopyTypesAsync);
        google.MapDelete("/", DisconnectAsync);
    }

    /// <summary>
    /// Chooses which kinds of event this parent copies (owner decision, October 30, 2026). Only their own copy changes;
    /// events no longer chosen are removed from their Google calendar on the next pass, which this starts.
    /// </summary>
    private static async Task<Results<Ok<GoogleCalendarView>, ForbidHttpResult, NotFound, ValidationProblem>> SetCopyTypesAsync(
        GoogleCopyTypesRequest request,
        ITenantContext tenant,
        CalendarDbContext db,
        IOptions<GoogleCalendarOptions> options,
        GoogleCalendarSyncSignal signal,
        IUnitOfWork unitOfWork,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.CopyTypes is null || request.CopyTypes.Any(t => !Enum.IsDefined(t)))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["copyTypes"] = ["Choose which kinds of event to copy."],
            });
        }

        var connection = await db.GoogleConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        if (connection is null)
        {
            return TypedResults.NotFound();
        }

        connection.CopyTypes = [.. request.CopyTypes.Distinct().Order()];
        await unitOfWork.ExecuteAsync(db.SaveChangesAsync, cancellationToken);
        signal.Poke();
        return TypedResults.Ok(View(connection, options.Value));
    }

    private static async Task<Results<Ok<GoogleCalendarView>, ForbidHttpResult>> GetAsync(
        ITenantContext tenant, CalendarDbContext db, IOptions<GoogleCalendarOptions> options, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var connection = await db.GoogleConnections.AsNoTracking()
            .SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        return TypedResults.Ok(View(connection, options.Value));
    }

    private static Results<Ok<GoogleAuthorizeView>, ForbidHttpResult, ProblemHttpResult> Authorize(
        ITenantContext tenant,
        IOptions<GoogleCalendarOptions> options,
        GoogleCalendarClient google,
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
            JsonSerializer.Serialize(new OAuthState(tenant.FamilyId, tenant.MembershipId, verifier)), StateLifetime);
        return TypedResults.Ok(new GoogleAuthorizeView(google.AuthorizeUrl(RedirectUri(urls), state, challenge)));
    }

    private static async Task<Results<Ok<GoogleCalendarView>, ForbidHttpResult, ProblemHttpResult, ValidationProblem>> ConnectAsync(
        GoogleConnectRequest request,
        ITenantContext tenant,
        CalendarDbContext db,
        IOptions<GoogleCalendarOptions> options,
        GoogleCalendarClient google,
        GoogleCalendarTokens tokens,
        GoogleCalendarSyncSignal signal,
        IDataProtectionProvider protection,
        PublicUrls urls,
        IFamilyRoster roster,
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

        GoogleTokens granted;
        string calendarId;
        try
        {
            granted = await google.ExchangeCodeAsync(request.Code, state.Verifier, RedirectUri(urls), cancellationToken);
            if (granted.RefreshToken is not { Length: > 0 } || !Granted(granted.Scope))
            {
                // The parent unticked calendar access on Google's consent page, or Google sent no refresh token.
                await TryRevokeAsync(google, granted.RefreshToken ?? granted.AccessToken);
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["code"] = ["Google didn't give Parenthesis access to make its calendar. Try again and allow calendar access."],
                });
            }

            var timeZone = await roster.TimeZoneAsync(cancellationToken);
            calendarId = await google.CreateCalendarAsync(granted.AccessToken, options.Value.CalendarName, timeZone, cancellationToken);
        }
        catch (GoogleCalendarException exception) when (exception.Failure == GoogleFailure.Revoked)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["code"] = ["This Google sign-in link has expired or was already used. Start again from Settings."],
            });
        }
        catch (Exception exception) when (exception is GoogleCalendarException or HttpRequestException or TaskCanceledException)
        {
            return GoogleUnreachable();
        }

        var connection = await db.GoogleConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        (string ProtectedRefreshToken, string GoogleCalendarId)? previous = connection is null ? null : (connection.ProtectedRefreshToken, connection.GoogleCalendarId);
        if (connection is null)
        {
            connection = new GoogleCalendarConnection
            {
                FamilyId = tenant.FamilyId,
                MembershipId = tenant.MembershipId,
                ProtectedRefreshToken = tokens.Protect(granted.RefreshToken),
                GoogleCalendarId = calendarId,
            };
            db.GoogleConnections.Add(connection);
        }
        else
        {
            // Reconnecting starts a fresh calendar; what was written to the old one no longer counts.
            connection.ProtectedRefreshToken = tokens.Protect(granted.RefreshToken);
            connection.GoogleCalendarId = calendarId;
            db.GoogleSyncedEvents.RemoveRange(await db.GoogleSyncedEvents.Where(s => s.ConnectionId == connection.Id).ToListAsync(cancellationToken));
        }

        (connection.Status, connection.Problem) = (GoogleConnectionStatus.Active, GoogleConnectionProblem.None);
        (connection.ConnectedAt, connection.LastSyncedAt) = (clock.GetUtcNow(), null);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(
                new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "google_calendar.connected", "google_calendar_connection", connection.Id), ct);
        }, cancellationToken);
        tokens.Remember(connection.Id, granted);

        if (previous is { } old)
        {
            // Tidy up the old calendar and grant (best effort): the same Google account can remove a calendar this app made.
            await TryDeleteCalendarAsync(google, granted.AccessToken, old.GoogleCalendarId);
            await TryRevokeAsync(google, TryUnprotect(tokens, old.ProtectedRefreshToken));
        }

        signal.Poke();
        return TypedResults.Ok(View(connection, options.Value));
    }

    /// <summary>
    /// Stops copying and forgets the grant. The "Parenthesis Family" calendar is removed from the parent's Google
    /// account so no stale copies stay behind; their other calendars are never touched. If Google can't be reached,
    /// Parenthesis still forgets the token, and the parent can remove the calendar and access in Google themselves.
    /// </summary>
    private static async Task<Results<NoContent, ForbidHttpResult>> DisconnectAsync(
        ITenantContext tenant,
        CalendarDbContext db,
        GoogleCalendarClient google,
        GoogleCalendarTokens tokens,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var connection = await db.GoogleConnections.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        if (connection is null)
        {
            return TypedResults.NoContent();
        }

        if (TryUnprotect(tokens, connection.ProtectedRefreshToken) is { } refreshToken)
        {
            try
            {
                var access = await google.RefreshAsync(refreshToken, cancellationToken);
                await TryDeleteCalendarAsync(google, access.AccessToken, connection.GoogleCalendarId);
            }
            catch (Exception exception) when (exception is GoogleCalendarException or HttpRequestException or TaskCanceledException)
            {
                // Access already revoked or Google unreachable: nothing more to remove from here.
            }

            await TryRevokeAsync(google, refreshToken);
        }

        tokens.Forget(connection.Id);
        db.GoogleConnections.Remove(connection);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(
                new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "google_calendar.disconnected", "google_calendar_connection", connection.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    private static GoogleCalendarView View(GoogleCalendarConnection? connection, GoogleCalendarOptions options) => new(
        options.IsOn,
        connection switch
        {
            null => GoogleCalendarState.NotConnected,
            { Status: GoogleConnectionStatus.Active } => GoogleCalendarState.Connected,
            _ => GoogleCalendarState.NeedsReconnect,
        },
        connection?.Problem ?? GoogleConnectionProblem.None,
        options.CalendarName,
        connection?.ConnectedAt,
        connection?.LastSyncedAt,
        connection?.CopyTypes ?? GoogleCalendarConnection.DefaultCopyTypes);

    private static bool Granted(string? scope) =>
        scope is null || scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(GoogleCalendarOptions.Scope, StringComparer.Ordinal);

    private static Uri RedirectUri(PublicUrls urls) => urls.Build(GoogleCalendarOptions.CallbackPath, new Dictionary<string, string?>());

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

    private static string? TryUnprotect(GoogleCalendarTokens tokens, string protectedToken)
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

    private static async Task TryDeleteCalendarAsync(GoogleCalendarClient google, string accessToken, string calendarId)
    {
        try
        {
            await google.DeleteCalendarAsync(accessToken, calendarId, CancellationToken.None);
        }
        catch (Exception exception) when (exception is GoogleCalendarException or HttpRequestException or TaskCanceledException)
        {
            // Best effort: the parent can delete the calendar in Google Calendar.
        }
    }

    private static async Task TryRevokeAsync(GoogleCalendarClient google, string? token)
    {
        if (token is null)
        {
            return;
        }

        try
        {
            await google.RevokeAsync(token, CancellationToken.None);
        }
        catch (Exception exception) when (exception is GoogleCalendarException or HttpRequestException or TaskCanceledException)
        {
            // Best effort: the parent can remove Parenthesis under "Third-party apps" in their Google account.
        }
    }

    private static ProblemHttpResult Unavailable() => TypedResults.Problem(
        title: "Google Calendar isn't available yet.",
        detail: "Copying events to Google Calendar hasn't been set up on this server.",
        statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult GoogleUnreachable() => TypedResults.Problem(
        title: "Google didn't answer.",
        detail: "Parenthesis couldn't finish connecting to Google Calendar. Try again in a few minutes.",
        statusCode: StatusCodes.Status502BadGateway);

    private sealed record OAuthState(Guid FamilyId, Guid MembershipId, string Verifier);
}
