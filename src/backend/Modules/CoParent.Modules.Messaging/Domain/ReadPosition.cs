using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Messaging.Domain;

/// <summary>
/// How far a parent has read the family conversation (#125): the latest message they have seen in an open, visible
/// conversation. It only moves forward, so a stale tab or a slower device can't move it back.
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

    /// <summary>Moves to <paramref name="message"/> when it is later than the current position. True when it moved.</summary>
    public bool AdvanceTo(ChatMessage message, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(message);
        if (message.Sequence <= 0)
        {
            throw new InvalidOperationException("The message must be stored before it can be read.");
        }

        if (message.Sequence <= MessageSequence)
        {
            return false;
        }

        MessageId = message.Id;
        MessageSequence = message.Sequence;
        UpdatedAt = now;
        return true;
    }
}
