using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Memories.Domain;

/// <summary>
/// A parent's own Memories settings (#403). <see cref="AllowCoParentDownload"/> ("Allow co-parent to download my shared
/// memories") is off unless they turn it on, and covers all of their photos, including batches already shared.
/// </summary>
internal sealed class MemorySettings : IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid MembershipId { get; init; }

    public bool AllowCoParentDownload { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
