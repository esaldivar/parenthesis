using CoParent.SharedKernel.Tenancy;

namespace CoParent.Infrastructure.Tenancy;

/// <summary>Scoped, request-lifetime tenant. Resolved once by the tenant gate, or by the code that creates a new family.</summary>
public sealed class TenantContext : ITenantContext
{
    /// <summary>Name of the EF Core query filter that every family-scoped entity declares.</summary>
    public const string QueryFilterName = "Tenant";

    public bool IsResolved { get; private set; }

    public Guid FamilyId { get; private set; }

    public Guid MembershipId { get; private set; }

    public FamilyRole Role { get; private set; }

    public void Resolve(Guid familyId, Guid membershipId, FamilyRole role)
    {
        if (IsResolved && familyId != FamilyId)
        {
            throw new InvalidOperationException("The tenant is already resolved to another family for this request.");
        }

        (IsResolved, FamilyId, MembershipId, Role) = (true, familyId, membershipId, role);
    }
}
