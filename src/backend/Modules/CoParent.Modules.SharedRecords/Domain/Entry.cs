using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.SharedRecords.Domain;

/// <summary>
/// One reported contribution (to a Shared Fund) or payment (on a Child Support record), with its required attachment.
/// The report stays as submitted: the other parent acknowledges it or flags a mismatch, and a correction is a new report.
/// </summary>
internal sealed class Entry : IFamilyScoped
{
    public const int MaxAttachmentBytes = 10 * 1024 * 1024;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required RecordKind RecordKind { get; init; }
    public required Guid RecordId { get; init; }
    public required Guid ReporterId { get; init; }
    public required Guid ResponderId { get; init; }
    public required long AmountMinor { get; init; }
    public required DateOnly PaidOn { get; init; }
    public required PaidTo PaidTo { get; init; }
    public required DateTimeOffset SubmittedAt { get; init; }
    /// <summary>The browser's id for this submission, so a retried or repeated submit records it once.</summary>
    public required Guid ClientRequestId { get; init; }
    public required string AttachmentPath { get; init; }
    public required string AttachmentType { get; init; }
    public required int AttachmentBytes { get; init; }
    public EntryStatus Status { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }
    /// <summary>Set when the family closes; the cleanup then deletes the file and this row.</summary>
    public DateTimeOffset? RemovedAt { get; set; }
}
