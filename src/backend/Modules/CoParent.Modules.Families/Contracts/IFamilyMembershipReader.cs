using CoParent.SharedKernel.Tenancy;

namespace CoParent.Modules.Families.Contracts;

public sealed record ActiveMembership(Guid MembershipId, FamilyRole Role);

/// <summary>Used by the tenant gate to check that a user may act in a family.</summary>
public interface IFamilyMembershipReader
{
    /// <summary>The user's active membership in the family, or null (no family, never joined, left or suspended).</summary>
    Task<ActiveMembership?> FindActiveAsync(Guid familyId, Guid userId, CancellationToken cancellationToken = default);
}
