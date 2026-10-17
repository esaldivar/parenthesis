using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Approvals.Domain;

internal enum ChangeRequestStatus
{
    Pending,
    Approved,
    Rejected,
    Withdrawn,
}

internal enum Decision
{
    Approve,
    Reject,
}

/// <summary>
/// A PR-style proposal that needs the parents' agreement (ADR-0003). The proposer's approval is implied; any rejection
/// resolves it; it's applied once enough parents approve.
/// </summary>
internal sealed class ChangeRequest : Entity, IFamilyScoped
{
    public const int SummaryMaxLength = 200;

    public Guid FamilyId { get; init; }

    public required string Type { get; init; }

    public required string TargetType { get; init; }

    public Guid TargetId { get; init; }

    public required string Summary { get; init; }

    public Guid ProposerMembershipId { get; init; }

    public ChangeRequestStatus Status { get; private set; } = ChangeRequestStatus.Pending;

    public DateTimeOffset CreatedAt { get; init; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    /// <summary>PostgreSQL xmin: two parents deciding at once can't both resolve it.</summary>
    public uint Version { get; private set; }

    public List<ApprovalDecision> Decisions { get; } = [];

    /// <summary>The proposer counts as an approval.</summary>
    public int Approvals => 1 + Decisions.Count(d => d.Decision == Decision.Approve);

    public void Resolve(ChangeRequestStatus status, DateTimeOffset now)
    {
        Status = status;
        ResolvedAt = now;
    }
}

internal sealed class ApprovalDecision : Entity
{
    public Guid ChangeRequestId { get; init; }

    public Guid DeciderMembershipId { get; init; }

    public Decision Decision { get; init; }

    public DateTimeOffset DecidedAt { get; init; }

    /// <summary>Optional, e.g. "Can we do Saturday instead?" (AP-05).</summary>
    public string? Comment { get; init; }

    public const int CommentMaxLength = 500;
}
