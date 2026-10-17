namespace CoParent.Modules.Approvals.Contracts;

/// <summary>The kinds of change that need both parents' approval (ADR-0003). More arrive with calendar and memories.</summary>
public static class ChangeRequestTypes
{
    /// <summary>Adding a child to the family (ADR-0006).</summary>
    public const string ChildCreate = "ChildCreate";
}

/// <summary>A proposal raised by a parent. The proposer's own approval is implied.</summary>
public sealed record ChangeRequestProposal(
    string Type, string TargetType, Guid TargetId, string Summary, Guid ProposerMembershipId, Guid ProposerUserId);

/// <summary>What a decided request is about, passed to the module that owns the target.</summary>
public sealed record ApprovalTarget(Guid ChangeRequestId, Guid FamilyId, string TargetType, Guid TargetId);

/// <summary>Raises change requests. Called inside the caller's unit of work, so the request commits with the change.</summary>
public interface IChangeRequests
{
    Task<Guid> ProposeAsync(ChangeRequestProposal proposal, CancellationToken cancellationToken = default);
}

/// <summary>
/// Implemented by the module that owns a target type. <see cref="ApplyAsync"/> and <see cref="RejectAsync"/> run in
/// the same transaction as the deciding vote, and must save their own changes.
/// </summary>
public interface IApprovalTargetHandler
{
    string Type { get; }

    /// <summary>
    /// The fewest approvals that resolve a request, even if the family has fewer parents yet. Adding a child needs 2:
    /// it waits for the co-parent to join and approve (ADR-0006).
    /// </summary>
    int MinimumApprovals { get; }

    Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken);

    Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken);
}

/// <summary>Who may decide: implemented by Families, so Approvals needn't depend on it.</summary>
public interface IApprovalParticipants
{
    Task<int> CountActiveParentsAsync(CancellationToken cancellationToken = default);
}
