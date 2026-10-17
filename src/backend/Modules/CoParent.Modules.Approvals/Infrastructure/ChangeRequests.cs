using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Approvals.Domain;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Tenancy;

namespace CoParent.Modules.Approvals.Infrastructure;

internal sealed class ChangeRequests(ApprovalsDbContext db, ITenantContext tenant, IAuditLog audit, TimeProvider clock)
    : IChangeRequests
{
    public async Task<Guid> ProposeAsync(ChangeRequestProposal proposal, CancellationToken cancellationToken = default)
    {
        var request = new ChangeRequest
        {
            FamilyId = tenant.FamilyId,
            Type = proposal.Type,
            TargetType = proposal.TargetType,
            TargetId = proposal.TargetId,
            Summary = proposal.Summary,
            ProposerMembershipId = proposal.ProposerMembershipId,
            CreatedAt = clock.GetUtcNow(),
        };
        db.ChangeRequests.Add(request);
        await db.SaveChangesAsync(cancellationToken);
        await audit.RecordAsync(
            new AuditEntry(tenant.FamilyId, proposal.ProposerUserId, "change_request.proposed", "change_request", request.Id), cancellationToken);
        return request.Id;
    }
}
