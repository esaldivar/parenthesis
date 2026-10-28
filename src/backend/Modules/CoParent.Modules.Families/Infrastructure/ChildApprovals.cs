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

/// <summary>
/// Applies PIN changes proposed under the earlier ADR-0006 rule, before #153 made a parent's reset immediate. Kept so
/// requests already waiting still resolve; no new requests of this type are created.
/// </summary>
internal sealed class ChildPinChangeHandler(FamiliesDbContext db, TimeProvider clock) : IApprovalTargetHandler
{
    public string Type => ChangeRequestTypes.ChildPinChange;

    public int MinimumApprovals => 2;

    public async Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var credential = await db.ChildCredentials.SingleOrDefaultAsync(c => c.ChildProfileId == target.TargetId, cancellationToken);
        if (credential?.PendingPinHash is { } pending)
        {
            credential.Reset(pending, clock.GetUtcNow());
            credential.PendingPinHash = null;
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        // Access may have been disabled meanwhile, in which case there's nothing left to change.
        var credential = await db.ChildCredentials.SingleOrDefaultAsync(c => c.ChildProfileId == target.TargetId, cancellationToken);
        if (credential is not null)
        {
            credential.PendingPinHash = null;
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

internal sealed class FamilyParticipants(FamiliesDbContext db) : IApprovalParticipants
{
    public Task<int> CountActiveParentsAsync(CancellationToken cancellationToken = default) =>
        db.Memberships.CountAsync(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, cancellationToken);
}
