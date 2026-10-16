# ADR-0003: One generic "ChangeRequest" approval engine

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16

## Context
The spec defines separate `CalendarProposal/CalendarApproval` and `DeletionRequest/DeletionApproval` entities. Both follow the same PR-like workflow: propose → notify → approve/reject → apply atomically → audit. More request types are likely (child access, category policy changes, recovery-period changes).

## Decision
Build one `ChangeRequest` aggregate with a typed `payload` (jsonb) and an `ApprovalDecision` child, owned by the **Approvals** module. Owning modules implement:

```csharp
public interface IApprovalTargetHandler
{
    ChangeRequestType Type { get; }
    Task<ValidationResult> ValidateProposalAsync(ChangeRequestDraft draft, CancellationToken ct);
    Task<ApplyResult> ApplyAsync(ChangeRequest request, CancellationToken ct); // runs in the same transaction
}
```

Rules: the proposer's approval is implied; every other active parent must approve; any rejection resolves the request; at most one pending request per target; requests become `Stale` if the target's version changed; requests expire after a configurable period.

## Consequences
- (+) One approvals inbox, one notification flow, one audit format and one set of concurrency tests.
- (+) Adding a new approval-gated action is one handler plus one payload type.
- (−) The payload is less strongly typed in the DB. Mitigation: versioned payload records, validated on write.
- The spec's `DeletionRequest` TypeScript interface stays available as an API projection.
