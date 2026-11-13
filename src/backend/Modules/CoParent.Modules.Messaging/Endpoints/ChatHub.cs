using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CoParent.Modules.Messaging.Endpoints;

/// <summary>
/// Live updates for the family conversation (#125): new messages, read positions and typing. Clients only listen and
/// choose which family to watch; everything they change goes through the REST endpoints, with antiforgery and the
/// tenant gate. Signed-in parents only: child sessions are refused before the connection opens (ADR-0006), and
/// <see cref="Watch"/> checks an active parent membership in that family, the same rule as the tenant gate.
/// </summary>
[Authorize]
internal sealed class ChatHub(IFamilyMembershipReader memberships) : Hub
{
    public const string Path = "/hubs/chat";

    private const string WatchedFamily = "family";

    public static string Group(Guid familyId) => $"family:{familyId:N}";

    /// <summary>Starts receiving the family's updates. A connection watches one family at a time.</summary>
    public async Task Watch(Guid familyId)
    {
        var user = Context.User;
        var userId = user?.GetChildSession() is null ? user?.GetUserId() : null;
        var membership = userId is null ? null : await memberships.FindActiveAsync(familyId, userId.Value, Context.ConnectionAborted);
        if (membership is not { Role: FamilyRole.Parent })
        {
            // The same answer for a family that doesn't exist, so outsiders learn nothing.
            throw new HubException("This conversation isn't available.");
        }

        if (Context.Items.TryGetValue(WatchedFamily, out var previous) && previous is Guid watched && watched != familyId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(watched), Context.ConnectionAborted);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, Group(familyId), Context.ConnectionAborted);
        Context.Items[WatchedFamily] = familyId;
    }
}
