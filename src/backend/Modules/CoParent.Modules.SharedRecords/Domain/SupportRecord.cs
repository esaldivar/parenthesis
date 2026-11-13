using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.SharedRecords.Domain;

/// <summary>
/// A one-time Child Support record (#477): a shared copy of payments one parent reports making through the applicable
/// official channel, and the other parent's confirmation. It has no schedule, balance or legal meaning. The reference
/// amount is optional and only shows progress.
/// </summary>
internal sealed class SupportRecord : IFamilyScoped
{
    public const int TitleLimit = 120;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required string Title { get; init; }
    public required string Currency { get; init; }
    public required Guid PayerId { get; init; }
    public required Guid RecipientId { get; init; }
    public long? ReferenceMinor { get; init; }
    public required Guid CreatedById { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
}
