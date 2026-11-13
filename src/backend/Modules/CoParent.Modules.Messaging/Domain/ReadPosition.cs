using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Messaging.Domain;

/// <summary>
/// How far a parent has read the family conversation (#125): the latest message they have seen in an open, visible
/// conversation. It only moves forward, so a stale tab or a slower device can't move it back: it is only written by one
/// conditional upsert (ChatEndpoints.AdvanceAsync).
/// </summary>
internal sealed class ReadPosition : IFamilyScoped
{
    public Guid FamilyId { get; init; }

    /// <summary>The reader. One position per parent.</summary>
    public Guid MembershipId { get; init; }

    public Guid MessageId { get; private set; }

    /// <summary>That message's place in the conversation (<see cref="ChatMessage.Sequence"/>).</summary>
    public long MessageSequence { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }
}
