using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.SharedRecords.Domain;
using CoParent.Modules.SharedRecords.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.SharedRecords.Infrastructure;

internal sealed class FundApproval(SharedRecordsDbContext db, IFamilyRoster roster) : IApprovalTargetHandler
{
    internal const string RequestType = "SharedFundProposal";
    public string Type => RequestType;
    public int MinimumApprovals => 2;

    public async Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var fund = await FindAsync(target, cancellationToken);
        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        if (!parents.SetEquals([fund.ProposerId, fund.CoParentId]))
        {
            throw new ApprovalRefusedException("The parents on this proposal have changed. Start a new proposal.");
        }

        fund.Status = FundStatus.Open;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var fund = await FindAsync(target, cancellationToken);
        fund.Status = FundStatus.ProposalEnded;
        await db.SaveChangesAsync(cancellationToken);
    }

    private Task<Fund> FindAsync(ApprovalTarget target, CancellationToken ct) =>
        db.Funds.SingleAsync(f => f.Id == target.TargetId && f.ApprovalId == target.ChangeRequestId, ct);
}
