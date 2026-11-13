using CoParent.Modules.Messaging.Endpoints;
using Microsoft.AspNetCore.SignalR;

namespace CoParent.Modules.Messaging.Infrastructure.Realtime;

/// <summary>Pushes the family's chat events to the parents watching it. Delivery is best effort: the REST endpoints
/// are the source of truth, and clients reload from them when they reconnect.</summary>
internal sealed class ChatNotifier(IHubContext<ChatHub> hub)
{
    public const string MessageEvent = "message";
    public const string ReadEvent = "read";
    public const string TypingEvent = "typing";

    public Task MessageAsync(Guid familyId, MessageView message, CancellationToken cancellationToken) =>
        Send(familyId, MessageEvent, message, cancellationToken);

    public Task ReadAsync(Guid familyId, ReadView read, CancellationToken cancellationToken) =>
        Send(familyId, ReadEvent, read, cancellationToken);

    public Task TypingAsync(Guid familyId, TypingView typing, CancellationToken cancellationToken) =>
        Send(familyId, TypingEvent, typing, cancellationToken);

    private async Task Send(Guid familyId, string name, object payload, CancellationToken cancellationToken)
    {
        try
        {
            await hub.Clients.Group(ChatHub.Group(familyId)).SendAsync(name, payload, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Never fail a saved message because a live update couldn't be sent.
        }
    }
}
