using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.SharedRecords.Domain;

internal enum FundStatus
{
    AwaitingAgreement,
    Open,
    ProposalEnded,
}

internal sealed class Fund : IFamilyScoped
{
    public const int TitleLimit = 120;
    public const long ShareLimit = 99_999_999_999_999;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required Guid ProposerId { get; init; }
    public required Guid CoParentId { get; init; }
    public required string Title { get; init; }
    public required string Currency { get; init; }
    public required long ProposerShareMinor { get; init; }
    public required long CoParentShareMinor { get; init; }
    public required Guid[] ChildIds { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public Guid ApprovalId { get; set; }
    public FundStatus Status { get; set; }
}
