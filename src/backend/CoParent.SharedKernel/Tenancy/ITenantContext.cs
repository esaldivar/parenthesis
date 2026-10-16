namespace CoParent.SharedKernel.Tenancy;

public enum FamilyRole
{
    Parent,
    Child,
}

/// <summary>
/// The family (tenant) the current request acts in, set by the tenant gate after it has verified an active
/// membership (ADR-0002). While unresolved, <see cref="FamilyId"/> is <see cref="Guid.Empty"/>, so tenant query
/// filters match nothing and family-scoped writes are rejected.
/// </summary>
public interface ITenantContext
{
    bool IsResolved { get; }

    Guid FamilyId { get; }

    Guid MembershipId { get; }

    FamilyRole Role { get; }
}
