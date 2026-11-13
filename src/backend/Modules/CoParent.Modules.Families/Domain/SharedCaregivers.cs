using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

internal sealed class SharedCaregivers : Entity, IFamilyScoped
{
    public required Guid FamilyId { get; init; }
    public required Guid ChildProfileId { get; init; }
    public int Version { get; set; }
    public string CaregiversJson { get; set; } = "[]";
}
