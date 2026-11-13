using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Messaging.Domain;

/// <summary>
/// A saved PDF transcript of the parents' conversation (#125, slice 3 of docs/design/m4-chat.md). It belongs to the parent
/// who saved it: an immutable snapshot of the sent messages in a date range (or all of them) as they were when saved.
/// Drafts and unsent messages are never in it.
/// </summary>
internal sealed class ChatTranscript : Entity, IFamilyScoped
{
    public const int FileNameMaxLength = 120;
    public const int RangeLabelMaxLength = 80;

    private ChatTranscript()
    {
    }

    public ChatTranscript(
        Guid familyId,
        Guid ownerMembershipId,
        string fileName,
        DateOnly? rangeFrom,
        DateOnly? rangeTo,
        string rangeLabel,
        int messageCount,
        DateTimeOffset createdAt,
        byte[] pdf)
    {
        FamilyId = familyId;
        OwnerMembershipId = ownerMembershipId;
        FileName = fileName;
        RangeFrom = rangeFrom;
        RangeTo = rangeTo;
        RangeLabel = rangeLabel;
        MessageCount = messageCount;
        CreatedAt = createdAt;
        Pdf = pdf;
    }

    public Guid FamilyId { get; private init; }

    /// <summary>The parent who saved it; only they can list or open it.</summary>
    public Guid OwnerMembershipId { get; private init; }

    public string FileName { get; private init; } = "";

    /// <summary>The first and last family-local dates included; both null for "All messages".</summary>
    public DateOnly? RangeFrom { get; private init; }

    public DateOnly? RangeTo { get; private init; }

    /// <summary>The messages' dates as shown in the list, e.g. "Nov 1–6, 2026".</summary>
    public string RangeLabel { get; private init; } = "";

    public int MessageCount { get; private init; }

    public DateTimeOffset CreatedAt { get; private init; }

    public byte[] Pdf { get; private init; } = [];
}
