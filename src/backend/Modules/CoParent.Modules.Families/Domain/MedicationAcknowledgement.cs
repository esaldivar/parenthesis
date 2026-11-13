using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A parent's one-time confirmation, before their first medication save, that medication is stored and visible to
/// their co-parent (#127, preflight D4). It holds who, when and which notice they saw; it goes when they leave.
/// </summary>
internal sealed class MedicationAcknowledgement : Entity, IFamilyScoped
{
    /// <summary>Changes when the medication notice text changes, so parents confirm the new one.</summary>
    public const string CurrentNoticeVersion = "2026-11-12";

    public const int NoticeVersionMaxLength = 16;

    public required Guid FamilyId { get; init; }
    public required Guid MembershipId { get; init; }
    public required DateTimeOffset AcknowledgedAt { get; init; }
    public required string NoticeVersion { get; init; }
}
