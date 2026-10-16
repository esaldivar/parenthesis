namespace CoParent.SharedKernel.Domain;

/// <summary>
/// Marks data owned by a family (the tenant). Every such entity gets a tenant query filter and a write guard
/// (ADR-0002); architecture tests fail the build if one is missing.
/// </summary>
public interface IFamilyScoped
{
    Guid FamilyId { get; }
}
