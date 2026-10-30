using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Threading.Channels;
using CoParent.Infrastructure.Email;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Encrypts refresh tokens at rest and keeps short-lived access tokens in memory only.</summary>
internal sealed class GoogleCalendarTokens(IDataProtectionProvider protection, GoogleCalendarClient google, TimeProvider clock)
{
    public const string Purpose = "CoParent.Calendar.GoogleCalendar.RefreshToken.v1";

    private readonly IDataProtector _protector = protection.CreateProtector(Purpose);
    private readonly ConcurrentDictionary<Guid, (string Token, DateTimeOffset Until)> _access = new();

    public string Protect(string refreshToken) => _protector.Protect(refreshToken);

    public string Unprotect(string protectedToken) => _protector.Unprotect(protectedToken);

    public void Remember(Guid connectionId, GoogleTokens tokens) =>
        _access[connectionId] = (tokens.AccessToken, clock.GetUtcNow() + tokens.ExpiresIn - TimeSpan.FromMinutes(1));

    public void Forget(Guid connectionId) => _access.TryRemove(connectionId, out _);

    /// <summary>A current access token, refreshed when the cached one is about to expire.</summary>
    public async Task<string> AccessTokenAsync(GoogleCalendarConnection connection, CancellationToken cancellationToken)
    {
        if (_access.TryGetValue(connection.Id, out var cached) && cached.Until > clock.GetUtcNow())
        {
            return cached.Token;
        }

        var tokens = await google.RefreshAsync(Unprotect(connection.ProtectedRefreshToken), cancellationToken);
        Remember(connection.Id, tokens);
        return tokens.AccessToken;
    }
}

/// <summary>Lets a request wake the sync worker early, e.g. right after a parent connects.</summary>
internal sealed class GoogleCalendarSyncSignal
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
/// Copies each connected parent's family calendar to their Google calendar (#386): one way only, nothing is read
/// back. Every pass compares what Google should show with what was last written and sends only the difference, so
/// it covers every way an event changes (edits, approvals, swaps, cancellations, expiry, a parent leaving) without
/// hooks in each of them. Each connection is handled in its own family's tenant.
/// </summary>
internal sealed partial class GoogleCalendarSync(
    IServiceScopeFactory scopes,
    IOptions<GoogleCalendarOptions> options,
    TimeProvider clock,
    ILogger<GoogleCalendarSync> logger) : IGoogleCalendarSync
{
    public async Task<int> SyncAsync(CancellationToken cancellationToken = default)
    {
        if (!options.Value.IsOn)
        {
            return 0;
        }

        List<(Guid Id, Guid FamilyId, Guid MembershipId)> active;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CalendarDbContext>();
            active = (await db.GoogleConnections
                    .IgnoreQueryFilters([TenantContext.QueryFilterName])
                    .Where(c => c.Status == GoogleConnectionStatus.Active)
                    .OrderBy(c => c.LastSyncedAt)
                    .Select(c => new { c.Id, c.FamilyId, c.MembershipId })
                    .ToListAsync(cancellationToken))
                .Select(c => (c.Id, c.FamilyId, c.MembershipId))
                .ToList();
        }

        var written = 0;
        foreach (var (id, familyId, membershipId) in active)
        {
            using var scope = scopes.CreateScope();
            scope.ServiceProvider.GetRequiredService<TenantContext>().Resolve(familyId, membershipId, FamilyRole.Parent);
            try
            {
                written += await SyncOneAsync(scope.ServiceProvider, id, cancellationToken);
            }
            catch (GoogleCalendarException exception)
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

        return written;
    }

    private async Task<int> SyncOneAsync(IServiceProvider services, Guid connectionId, CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<CalendarDbContext>();
        var google = services.GetRequiredService<GoogleCalendarClient>();
        var tokens = services.GetRequiredService<GoogleCalendarTokens>();
        var connection = await db.GoogleConnections.SingleOrDefaultAsync(
            c => c.Id == connectionId && c.Status == GoogleConnectionStatus.Active, cancellationToken);
        if (connection is null)
        {
            return 0;
        }

        string accessToken;
        try
        {
            accessToken = await tokens.AccessTokenAsync(connection, cancellationToken);
        }
        catch (GoogleCalendarException exception) when (exception.Failure == GoogleFailure.Revoked)
        {
            return await StopAsync(services, connection, GoogleConnectionProblem.AccessRevoked, cancellationToken);
        }
        catch (CryptographicException)
        {
            // The data-protection key that encrypted the token is gone; the parent has to connect again.
            return await StopAsync(services, connection, GoogleConnectionProblem.AccessRevoked, cancellationToken);
        }

        var now = clock.GetUtcNow();
        var (from, to) = (now - options.Value.PastWindow, now + options.Value.FutureWindow);
        var timeZone = await services.GetRequiredService<IFamilyRoster>().TimeZoneAsync(cancellationToken);
        var link = services.GetRequiredService<PublicUrls>().Build("/calendar", new Dictionary<string, string?>());

        var wanted = (await db.Events.AsNoTracking()
                .Where(e => e.Status == EventStatus.Confirmed && e.EndsAt > from && e.StartsAt < to)
                .OrderBy(e => e.StartsAt)
                .ToListAsync(cancellationToken))
            .Where(connection.Copies)
            .ToDictionary(e => e.Id, e => GoogleEventProjection.Body(e, connection.MembershipId, timeZone, link));
        var written = await db.GoogleSyncedEvents.Where(s => s.ConnectionId == connection.Id).ToDictionaryAsync(s => s.EventId, cancellationToken);

        var writes = 0;
        try
        {
            foreach (var (eventId, body) in wanted)
            {
                var hash = GoogleEventProjection.Hash(body);
                if (written.TryGetValue(eventId, out var previous) && previous.Hash == hash)
                {
                    continue;
                }

                if (writes++ >= options.Value.MaxWritesPerPass)
                {
                    break;
                }

                await google.PutEventAsync(accessToken, connection.GoogleCalendarId, GoogleEventProjection.GoogleId(eventId), body, cancellationToken);
                if (previous is null)
                {
                    db.GoogleSyncedEvents.Add(new GoogleSyncedEvent { FamilyId = connection.FamilyId, ConnectionId = connection.Id, EventId = eventId, Hash = hash });
                }
                else
                {
                    previous.Hash = hash;
                }
            }

            var gone = written.Keys.Where(id => !wanted.ContainsKey(id)).ToList();
            // A confirmed event the parent still copies that only left the window (it ended long ago, or moved far
            // ahead) stays in Google as it was. Anything cancelled, declined, deleted or no longer chosen is removed.
            var outOfRange = (await db.Events.AsNoTracking()
                    .Where(e => gone.Contains(e.Id) && e.Status == EventStatus.Confirmed && (e.EndsAt <= from || e.StartsAt >= to))
                    .ToListAsync(cancellationToken))
                .Where(connection.Copies)
                .Select(e => e.Id)
                .ToHashSet();
            foreach (var eventId in gone)
            {
                if (!outOfRange.Contains(eventId))
                {
                    if (writes++ >= options.Value.MaxWritesPerPass)
                    {
                        break;
                    }

                    await google.DeleteEventAsync(accessToken, connection.GoogleCalendarId, GoogleEventProjection.GoogleId(eventId), cancellationToken);
                }

                db.GoogleSyncedEvents.Remove(written[eventId]);
            }

            connection.LastSyncedAt = now;
        }
        catch (GoogleCalendarException exception) when (exception.Failure is GoogleFailure.Revoked or GoogleFailure.NotFound)
        {
            var problem = exception.Failure == GoogleFailure.Revoked
                ? GoogleConnectionProblem.AccessRevoked
                : await google.CalendarExistsAsync(accessToken, connection.GoogleCalendarId, cancellationToken)
                    ? GoogleConnectionProblem.None
                    : GoogleConnectionProblem.CalendarRemoved;
            if (problem != GoogleConnectionProblem.None)
            {
                return await StopAsync(services, connection, problem, cancellationToken);
            }

            throw;
        }
        finally
        {
            // Whatever reached Google is recorded, even when a later write failed.
            await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(db.SaveChangesAsync, CancellationToken.None);
        }

        return Math.Min(writes, options.Value.MaxWritesPerPass);
    }

    private async Task<int> StopAsync(
        IServiceProvider services, GoogleCalendarConnection connection, GoogleConnectionProblem problem, CancellationToken cancellationToken)
    {
        connection.Stop(problem);
        services.GetRequiredService<GoogleCalendarTokens>().Forget(connection.Id);
        await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(
            services.GetRequiredService<CalendarDbContext>().SaveChangesAsync, cancellationToken);
        LogStopped(connection.Id, problem);
        return 0;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Google Calendar copy for connection {ConnectionId} failed: {Failure} (HTTP {Status}); retrying next pass")]
    private partial void LogGoogleFailed(Guid connectionId, GoogleFailure failure, int? status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Google Calendar was unreachable for connection {ConnectionId}; retrying next pass")]
    private partial void LogUnreachable(Guid connectionId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Google Calendar copy for connection {ConnectionId} stopped: {Problem}")]
    private partial void LogStopped(Guid connectionId, GoogleConnectionProblem problem);
}

/// <summary>Runs <see cref="GoogleCalendarSync"/> every interval, or sooner when poked.</summary>
internal sealed partial class GoogleCalendarSyncWorker(
    GoogleCalendarSync sync,
    GoogleCalendarSyncSignal signal,
    IOptions<GoogleCalendarOptions> options,
    TimeProvider clock,
    ILogger<GoogleCalendarSyncWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.IsOn || !options.Value.BackgroundSync)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            await signal.WaitAsync(options.Value.SyncInterval, clock, stoppingToken);
            try
            {
                await sync.SyncAsync(stoppingToken);
            }
#pragma warning disable CA1031 // The worker must keep running; the next pass retries.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The Google Calendar copy pass failed")]
    private partial void LogFailed(Exception exception);
}
