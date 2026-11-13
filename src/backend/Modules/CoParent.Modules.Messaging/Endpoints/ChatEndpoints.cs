using CoParent.Modules.Calendar.Contracts;
using CoParent.Modules.Messaging.Domain;
using CoParent.Modules.Messaging.Infrastructure.Persistence;
using CoParent.Modules.Messaging.Realtime;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Messaging.Endpoints;

/// <summary>A message as one parent sees it. <c>Yours</c>: the viewer sent it. <c>ClientMessageId</c> lets the sender's
/// device match its pending copy, including after a retry. <c>EventId</c>: a shared calendar event; <c>Event</c> is its
/// card as the viewer's calendar shows it (left out of live pushes, which every parent's device then reads for itself).</summary>
internal sealed record MessageView(
    Guid Id,
    Guid ClientMessageId,
    Guid SenderMembershipId,
    bool Yours,
    string Text,
    DateTimeOffset SentAt,
    Guid? EventId = null,
    EventCardView? Event = null);

/// <summary>
/// A shared event's card. <c>Available</c> is false when the viewer's calendar no longer shows it (cancelled, or a
/// declined request they removed); then nothing else about it is given.
/// </summary>
internal sealed record EventCardView(
    Guid Id,
    bool Available,
    string? Title = null,
    DateTimeOffset? StartsAt = null,
    DateTimeOffset? EndsAt = null,
    bool AllDay = false,
    SharedEventStatus? Status = null,
    bool ChangePending = false);

/// <summary>
/// A page of the conversation, oldest first. <c>HasOlder</c>: more messages before the first one. <c>YourReadThrough</c>
/// and <c>CoParentReadThrough</c>: the latest message each parent has read (null when none), for the "New messages"
/// divider and the Read receipt.
/// </summary>
internal sealed record ConversationView(
    Guid YourMembershipId,
    IReadOnlyList<MessageView> Messages,
    bool HasOlder,
    Guid? YourReadThrough,
    Guid? CoParentReadThrough);

/// <summary>The navigation's unread dot. <c>Count</c> stops at <see cref="ChatEndpoints.UnreadCap"/>.</summary>
internal sealed record UnreadView(int Count, bool HasUnread);

internal sealed record ReadView(Guid MembershipId, Guid MessageId);

internal sealed record TypingView(Guid MembershipId);

internal sealed record SendRequest(Guid? ClientMessageId, string? Text, Guid? EventId = null);

internal sealed record ReadRequest(Guid? MessageId);

/// <summary>
/// The family conversation between its two parents (#125; docs/design/m4-chat.md). Children never reach it: child
/// sessions are refused by the host (ADR-0006) and every endpoint also requires the Parent role. Messages are text
/// only and can't be edited or deleted, so there are no such endpoints.
/// </summary>
internal static class ChatEndpoints
{
    public const string SendRateLimitPolicy = "chat-send";
    public const string TypingRateLimitPolicy = "chat-typing";
    public const int PageSize = 50;
    public const int UnreadCap = 99;

    public static void Map(IEndpointRouteBuilder family)
    {
        var chat = family.MapGroup("/chat");
        chat.MapGet("/", ConversationAsync);
        chat.MapPost("/messages", SendAsync).RequireRateLimiting(SendRateLimitPolicy);
        chat.MapGet("/messages/{messageId:guid}", MessageAsync);
        chat.MapPut("/read", ReadAsync);
        chat.MapGet("/unread", UnreadAsync);
        chat.MapPost("/typing", TypingAsync).RequireRateLimiting(TypingRateLimitPolicy);
        TranscriptEndpoints.Map(chat);
    }

    /// <summary>The latest page, or the page before <paramref name="before"/> (a message id) when loading older ones.</summary>
    private static async Task<Results<Ok<ConversationView>, NotFound, ForbidHttpResult>> ConversationAsync(
        Guid? before, ITenantContext tenant, MessagingDbContext db, ISharedEventCards cards, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var query = db.Messages.AsNoTracking();
        if (before is { } beforeId)
        {
            // Another family's message id finds nothing here (tenant filter), the same as one that doesn't exist.
            var anchor = await db.Messages.AsNoTracking().Where(m => m.Id == beforeId).Select(m => (long?)m.Sequence).SingleOrDefaultAsync(ct);
            if (anchor is not { } sequence)
            {
                return TypedResults.NotFound();
            }

            query = query.Where(m => m.Sequence < sequence);
        }

        var page = await query.OrderByDescending(m => m.Sequence).Take(PageSize + 1).ToListAsync(ct);
        var hasOlder = page.Count > PageSize;
        var shown = page.Take(PageSize).Reverse().ToList();
        var events = await CardsAsync(cards, tenant.MembershipId, shown, ct);
        var messages = shown.Select(m => View(m, tenant.MembershipId, events)).ToList();

        var positions = await db.ReadPositions.AsNoTracking().ToListAsync(ct);
        var yours = positions.FirstOrDefault(p => p.MembershipId == tenant.MembershipId)?.MessageId;
        var coParent = positions.Where(p => p.MembershipId != tenant.MembershipId)
            .OrderByDescending(p => p.MessageSequence).FirstOrDefault()?.MessageId;
        return TypedResults.Ok(new ConversationView(tenant.MembershipId, messages, hasOlder, yours, coParent));
    }

    /// <summary>
    /// Sends a message. Idempotent per <c>ClientMessageId</c>: a retry gets the stored message (200) instead of a second
    /// copy (201). Sending also marks everything up to it read for the sender.
    /// </summary>
    private static async Task<Results<Created<MessageView>, Ok<MessageView>, ValidationProblem, ForbidHttpResult>> SendAsync(
        SendRequest request,
        ITenantContext tenant,
        MessagingDbContext db,
        IUnitOfWork unitOfWork,
        ChatNotifier notifier,
        ISharedEventCards cards,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var errors = new Dictionary<string, string[]>();
        var shared = request.EventId is { } eventId && eventId != Guid.Empty ? eventId : (Guid?)null;
        if (request.ClientMessageId is not { } clientId || clientId == Guid.Empty)
        {
            errors["clientMessageId"] = ["Each message needs its own id."];
        }

        var text = ChatMessage.Normalize(request.Text);
        if (text is null && shared is null)
        {
            errors["text"] = ["Write a message first."];
        }
        else if (text?.Length > ChatMessage.TextMaxLength)
        {
            errors["text"] = [$"Keep messages under {ChatMessage.TextMaxLength:N0} characters."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var existing = await Find(db, tenant.MembershipId, request.ClientMessageId!.Value, ct);
        if (existing is not null)
        {
            return TypedResults.Ok(View(existing, tenant.MembershipId, await CardsAsync(cards, tenant.MembershipId, [existing], ct)));
        }

        // Only an event the sender's own calendar shows can be shared; another family's id looks the same as none.
        var events = shared is { } id ? await cards.VisibleToAsync(tenant.MembershipId, [id], ct) : new Dictionary<Guid, SharedEvent>();
        if (shared is { } wanted && !events.ContainsKey(wanted))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["eventId"] = ["That event isn’t on your calendar any more. Choose another one."],
            });
        }

        var now = clock.GetUtcNow();
        var message = new ChatMessage(tenant.FamilyId, tenant.MembershipId, request.ClientMessageId.Value, text ?? "", now, shared);
        try
        {
            await unitOfWork.ExecuteAsync(async token =>
            {
                db.Messages.Add(message);
                await db.SaveChangesAsync(token); // assigns the message's place in the conversation
                await AdvanceAsync(db, tenant, message, now, token);
            }, ct);
        }
        catch (DbUpdateException)
        {
            // Two copies of the same send raced: the other one stored it first. Leave the rolled-back transaction
            // before looking it up (as GooglePhotosEndpoints does).
            await db.Database.UseTransactionAsync(null, ct);
            db.ChangeTracker.Clear();
            if (await Find(db, tenant.MembershipId, request.ClientMessageId.Value, ct) is { } stored)
            {
                return TypedResults.Ok(View(stored, tenant.MembershipId, events));
            }

            throw;
        }

        var view = View(message, tenant.MembershipId, events);
        // Each parent's device decides "Yours" from SenderMembershipId. The pushed copy leaves out the event card, which
        // is the sender's view: a device that gets an EventId reads the message for itself (MessageAsync).
        await notifier.MessageAsync(tenant.FamilyId, view with { Yours = false, Event = null }, ct);
        await notifier.ReadAsync(tenant.FamilyId, new ReadView(tenant.MembershipId, message.Id), ct);
        return TypedResults.Created($"/api/families/{tenant.FamilyId}/chat/messages/{message.Id}", view);
    }

    /// <summary>
    /// Marks the conversation read up to a message the parent has seen in an open, visible conversation. Moving back to
    /// an earlier message changes nothing.
    /// </summary>
    private static async Task<Results<NoContent, NotFound, ValidationProblem, ForbidHttpResult>> ReadAsync(
        ReadRequest request,
        ITenantContext tenant,
        MessagingDbContext db,
        ChatNotifier notifier,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.MessageId is not { } messageId)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["messageId"] = ["Say which message was read."] });
        }

        var message = await db.Messages.AsNoTracking().SingleOrDefaultAsync(m => m.Id == messageId, ct);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        // One statement, so no transaction is needed around it.
        if (await AdvanceAsync(db, tenant, message, clock.GetUtcNow(), ct))
        {
            await notifier.ReadAsync(tenant.FamilyId, new ReadView(tenant.MembershipId, message.Id), ct);
        }

        return TypedResults.NoContent();
    }

    /// <summary>How many of the co-parent's messages this parent hasn't read yet.</summary>
    private static async Task<Results<Ok<UnreadView>, ForbidHttpResult>> UnreadAsync(
        ITenantContext tenant, MessagingDbContext db, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var position = await db.ReadPositions.AsNoTracking().SingleOrDefaultAsync(p => p.MembershipId == tenant.MembershipId, ct);
        var unread = db.Messages.AsNoTracking().Where(m => m.SenderMembershipId != tenant.MembershipId);
        if (position is not null)
        {
            unread = unread.Where(m => m.Sequence > position.MessageSequence);
        }

        var count = await unread.Take(UnreadCap).CountAsync(ct);
        return TypedResults.Ok(new UnreadView(count, count > 0));
    }

    /// <summary>Tells the co-parent this parent is typing. Nothing is stored; their device shows it briefly.</summary>
    private static async Task<Results<NoContent, ForbidHttpResult>> TypingAsync(
        ITenantContext tenant, ChatNotifier notifier, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        await notifier.TypingAsync(tenant.FamilyId, new TypingView(tenant.MembershipId), ct);
        return TypedResults.NoContent();
    }

    /// <summary>One message as this parent sees it, with its event card; for a live push that shares an event.</summary>
    private static async Task<Results<Ok<MessageView>, NotFound, ForbidHttpResult>> MessageAsync(
        Guid messageId, ITenantContext tenant, MessagingDbContext db, ISharedEventCards cards, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var message = await db.Messages.AsNoTracking().SingleOrDefaultAsync(m => m.Id == messageId, ct);
        return message is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(View(message, tenant.MembershipId, await CardsAsync(cards, tenant.MembershipId, [message], ct)));
    }

    private static async Task<IReadOnlyDictionary<Guid, SharedEvent>> CardsAsync(
        ISharedEventCards cards, Guid viewer, IReadOnlyCollection<ChatMessage> messages, CancellationToken ct)
    {
        var ids = messages.Where(m => m.EventId is not null).Select(m => m.EventId!.Value).Distinct().ToList();
        return ids.Count == 0 ? new Dictionary<Guid, SharedEvent>() : await cards.VisibleToAsync(viewer, ids, ct);
    }

    private static Task<ChatMessage?> Find(MessagingDbContext db, Guid sender, Guid clientId, CancellationToken ct) =>
        db.Messages.AsNoTracking().SingleOrDefaultAsync(m => m.SenderMembershipId == sender && m.ClientMessageId == clientId, ct);

    /// <summary>
    /// Moves this parent's read position to <paramref name="message"/> if it's later, in one statement: two tabs (or a
    /// send and a read) at once can't move it back, and a parent's first two reads can't both try to insert it. True
    /// when it moved.
    /// </summary>
    private static async Task<bool> AdvanceAsync(MessagingDbContext db, ITenantContext tenant, ChatMessage message, DateTimeOffset now, CancellationToken ct)
    {
        if (message.Sequence <= 0)
        {
            throw new InvalidOperationException("The message must be stored before it can be read.");
        }

        var moved = await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO messaging.read_positions (membership_id, family_id, message_id, message_sequence, updated_at)
            VALUES ({tenant.MembershipId}, {tenant.FamilyId}, {message.Id}, {message.Sequence}, {now})
            ON CONFLICT (membership_id) DO UPDATE
            SET message_id = excluded.message_id, message_sequence = excluded.message_sequence, updated_at = excluded.updated_at
            WHERE read_positions.message_sequence < excluded.message_sequence
            """,
            ct);
        return moved > 0;
    }

    private static MessageView View(ChatMessage message, Guid viewer, IReadOnlyDictionary<Guid, SharedEvent> events) =>
        new(
            message.Id,
            message.ClientMessageId,
            message.SenderMembershipId,
            message.SenderMembershipId == viewer,
            message.Text,
            message.SentAt,
            message.EventId,
            message.EventId is not { } id
                ? null
                : events.GetValueOrDefault(id) is { } e
                    ? new EventCardView(id, true, e.Title, e.StartsAt, e.EndsAt, e.AllDay, e.Status, e.ChangePending)
                    : new EventCardView(id, false));
}
