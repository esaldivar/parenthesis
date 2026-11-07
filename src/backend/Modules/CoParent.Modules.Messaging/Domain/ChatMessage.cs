using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Messaging.Domain;

/// <summary>
/// A text message between the two parents of a family (#125). There is one conversation per family. Messages are
/// never edited or deleted (accountability, exportable history), so every property is set once.
/// </summary>
internal sealed class ChatMessage : Entity, IFamilyScoped
{
    /// <summary>The longest message, in characters.</summary>
    public const int TextMaxLength = 2000;

    private ChatMessage()
    {
    }

    public ChatMessage(Guid familyId, Guid senderMembershipId, Guid clientMessageId, string text, DateTimeOffset sentAt, Guid? eventId = null)
    {
        FamilyId = familyId;
        SenderMembershipId = senderMembershipId;
        ClientMessageId = clientMessageId;
        Text = text;
        SentAt = sentAt;
        EventId = eventId;
    }

    public Guid FamilyId { get; private init; }

    /// <summary>The conversation's order, assigned by the database when the message is stored.</summary>
    public long Sequence { get; private set; }

    public Guid SenderMembershipId { get; private init; }

    /// <summary>
    /// Chosen by the sender's device for each message it composes. A retry after a lost response or a repeated click
    /// sends the same id, and the server returns the message it already has instead of storing a second one.
    /// </summary>
    public Guid ClientMessageId { get; private init; }

    /// <summary>The text; empty when the message only shares an event.</summary>
    public string Text { get; private init; } = "";

    /// <summary>
    /// A calendar event shared with the message (slice 2 of docs/design/m4-chat.md). Only its id is kept: each parent's
    /// card is read from the Calendar with their own permissions, so a cancelled or hidden event shows as unavailable.
    /// </summary>
    public Guid? EventId { get; private init; }

    public DateTimeOffset SentAt { get; private init; }

    /// <summary>The text to store: line endings normalized and outer whitespace trimmed. Null when nothing is left.</summary>
    public static string? Normalize(string? text)
    {
        var trimmed = text?.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
