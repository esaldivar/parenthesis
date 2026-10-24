using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Approvals.Domain;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Auditing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Approvals.Infrastructure;

/// <summary>
/// When a parent deletes their account (A-12): their own pending proposals are withdrawn, exactly as if they had taken
/// them back. The co-parent's pending proposals are re-checked against the parents who remain, so one that no longer
/// needs anyone else's answer is applied, like any proposal in a one-parent family. If the family is closing, its
/// requests and decisions are deleted.
/// </summary>
internal sealed class ApprovalsDeparture(
    ApprovalsDbContext db,
    IEnumerable<IApprovalTargetHandler> handlers,
    IApprovalParticipants participants,
    IAuditLog audit,
    TimeProvider clock) : IParentDepartureHandler
{
    public int Order => 10;

    public async Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken)
    {
        if (departure.FamilyClosing)
        {
            db.ChangeRequests.RemoveRange(await db.ChangeRequests.ToListAsync(cancellationToken));
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        var now = clock.GetUtcNow();
        var pending = await db.ChangeRequests
            .Where(r => r.Status == ChangeRequestStatus.Pending)
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(cancellationToken);
        var parents = await participants.CountActiveParentsAsync(cancellationToken);

        foreach (var request in pending)
        {
            var handler = handlers.Single(h => h.Type == request.Type);
            var target = new ApprovalTarget(request.Id, request.FamilyId, request.TargetType, request.TargetId);
            if (request.ProposerMembershipId == departure.MembershipId)
            {
                request.Resolve(ChangeRequestStatus.Withdrawn, now);
                await handler.RejectAsync(target, cancellationToken);
                await audit.RecordAsync(new AuditEntry(request.FamilyId, null, "change_request.withdrawn", "change_request", request.Id), cancellationToken);
            }
            else if (request.Approvals >= Math.Max(parents, handler.MinimumApprovals))
            {
                request.Resolve(ChangeRequestStatus.Approved, now);
                await handler.ApplyAsync(target, cancellationToken);
                await audit.RecordAsync(new AuditEntry(request.FamilyId, null, "change_request.approved", "change_request", request.Id), cancellationToken);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
