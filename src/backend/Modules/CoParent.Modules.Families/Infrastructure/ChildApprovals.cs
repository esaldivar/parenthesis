using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>Adding a child needs both parents, even before the co-parent has joined (ADR-0006).</summary>
internal sealed class ChildCreateHandler(FamiliesDbContext db) : IApprovalTargetHandler
{
    public string Type => ChangeRequestTypes.ChildCreate;

    public int MinimumApprovals => 2;

    public Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken) =>
        SetStatusAsync(target, ChildStatus.Active, cancellationToken);

    public Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken) =>
        SetStatusAsync(target, ChildStatus.Rejected, cancellationToken);

    private async Task SetStatusAsync(ApprovalTarget target, ChildStatus status, CancellationToken cancellationToken)
    {
        var child = await db.Children.SingleAsync(c => c.Id == target.TargetId, cancellationToken);
        child.Status = status;
        await db.SaveChangesAsync(cancellationToken);
    }
}

internal sealed class FamilyParticipants(FamiliesDbContext db) : IApprovalParticipants
{
    public Task<int> CountActiveParentsAsync(CancellationToken cancellationToken = default) =>
        db.Memberships.CountAsync(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, cancellationToken);
}
