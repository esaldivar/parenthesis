namespace CoParent.SharedKernel.Auditing;

/// <summary>One accountable action: who did what to which resource, in which family. <c>Action</c> is a dotted verb such as <c>family.created</c>.</summary>
public sealed record AuditEntry(Guid? FamilyId, Guid? ActorUserId, string Action, string ResourceType, Guid? ResourceId);

/// <summary>
/// Append-only audit trail. Writes join the current unit of work, so an action and its audit record commit together.
/// </summary>
public interface IAuditLog
{
    Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default);
}
