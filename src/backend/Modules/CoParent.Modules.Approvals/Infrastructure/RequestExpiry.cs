using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Approvals.Domain;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Approvals.Infrastructure;

/// <summary>
/// Expires pending requests older than the configured lifetime. Each request is handled in its own family's tenant
/// and unit of work, exactly like a rejection: the owning module discards the proposal (a pending child isn't
/// created, a proposed change is dropped, the event keeps its values).
/// </summary>
internal sealed partial class RequestExpiry(IServiceScopeFactory scopes, IOptions<ApprovalOptions> options, ILogger<RequestExpiry> logger)
    : IRequestExpiry
{
    public async Task<int> ExpireAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var cutoff = now - options.Value.RequestLifetime;
        List<(Guid Id, Guid FamilyId)> due;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApprovalsDbContext>();
            due = (await db.ChangeRequests
                    .IgnoreQueryFilters([TenantContext.QueryFilterName])
                    .Where(r => r.Status == ChangeRequestStatus.Pending && r.CreatedAt < cutoff)
                    .OrderBy(r => r.CreatedAt)
                    .Take(100)
                    .Select(r => new { r.Id, r.FamilyId })
                    .ToListAsync(cancellationToken))
                .Select(r => (r.Id, r.FamilyId))
                .ToList();
        }

        var expired = 0;
        foreach (var (id, familyId) in due)
        {
            using var scope = scopes.CreateScope();
            var services = scope.ServiceProvider;
            services.GetRequiredService<TenantContext>().Resolve(familyId, Guid.Empty, FamilyRole.Parent);
            var db = services.GetRequiredService<ApprovalsDbContext>();
            var request = await db.ChangeRequests.SingleAsync(r => r.Id == id, cancellationToken);
            if (request.Status != ChangeRequestStatus.Pending)
            {
                continue;
            }

            var handler = services.GetServices<IApprovalTargetHandler>().Single(h => h.Type == request.Type);
            try
            {
                await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(async ct =>
                {
                    request.Resolve(ChangeRequestStatus.Expired, now);
                    await handler.RejectAsync(new ApprovalTarget(request.Id, familyId, request.TargetType, request.TargetId), ct);
                    await db.SaveChangesAsync(ct);
                    await services.GetRequiredService<IAuditLog>().RecordAsync(
                        new AuditEntry(familyId, null, "change_request.expired", "change_request", request.Id), ct);
                }, cancellationToken);
                expired++;
            }
            catch (DbUpdateConcurrencyException)
            {
                // A parent answered it at the same moment; their answer stands.
            }
        }

        if (expired > 0)
        {
            LogExpired(expired);
        }

        return expired;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Expired {Count} unanswered change requests")]
    private partial void LogExpired(int count);
}

/// <summary>Runs <see cref="RequestExpiry"/> on a timer.</summary>
internal sealed partial class RequestExpiryWorker(
    RequestExpiry expiry, IOptions<ApprovalOptions> options, TimeProvider clock, ILogger<RequestExpiryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.CheckInterval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await expiry.ExpireAsync(clock.GetUtcNow(), stoppingToken);
            }
#pragma warning disable CA1031 // The worker must keep running; the next tick retries.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The request expiry check failed")]
    private partial void LogFailed(Exception exception);
}
