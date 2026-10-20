using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record DeleteAccountRequest(string? Password);

/// <summary>
/// A parent deletes their own account (A-12; owner decisions, October 20, 2026). Permanent at once, after the password
/// is re-entered. Each family is handled in its own tenant and transaction:
/// <list type="bullet">
/// <item>With a co-parent: the membership is marked as left, so the family, children and shared history stay with them
/// and the departing parent shows as "Former parent". Their household devices and unsent invitations are revoked, and
/// every module tidies its own data (<see cref="IParentDepartureHandler"/>).</item>
/// <item>As the only parent: the whole family goes, with its children, devices and invitations.</item>
/// </list>
/// Then the sign-in account is deleted, every session ends, and the emails go out.
/// </summary>
internal static class AccountDeletionEndpoints
{
    public const string RateLimitPolicy = "account-deletion";

    public static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/me/delete", DeleteAsync).WithTags("Me").RequireRateLimiting(RateLimitPolicy);

    private static async Task<Results<NoContent, ValidationProblem>> DeleteAsync(
        DeleteAccountRequest request,
        HttpContext http,
        IAccountRemoval accounts,
        IUserDirectory directory,
        FamiliesDbContext db,
        IServiceScopeFactory scopes,
        IAuditLog audit,
        AccountDeletionEmails emails,
        CancellationToken cancellationToken)
    {
        var userId = http.User.GetUserId()!.Value;
        if (string.IsNullOrEmpty(request.Password) || !await accounts.CheckPasswordAsync(userId, request.Password, cancellationToken))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["password"] = ["That password isn't right."],
            });
        }

        var me = await directory.FindByIdAsync(userId, cancellationToken);

        // The user's own memberships span families by design; constrained to this user.
        var memberships = await db.Memberships
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active)
            .Select(m => new { m.Id, m.FamilyId, m.Role })
            .ToListAsync(cancellationToken);

        var coParents = new HashSet<Guid>();
        foreach (var membership in memberships)
        {
            foreach (var remaining in await LeaveFamilyAsync(scopes, userId, membership.FamilyId, membership.Id, membership.Role, cancellationToken))
            {
                coParents.Add(remaining);
            }
        }

        await accounts.DeleteAsync(userId, cancellationToken);
        await audit.RecordAsync(new AuditEntry(null, userId, "account.deleted", "user", userId), cancellationToken);
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);

        if (me is not null)
        {
            await emails.SendDeletedAsync(me.Email, cancellationToken);
        }

        foreach (var coParentId in coParents)
        {
            if (await directory.FindByIdAsync(coParentId, cancellationToken) is { } coParent)
            {
                await emails.SendParentLeftAsync(coParent.Email, cancellationToken);
            }
        }

        return TypedResults.NoContent();
    }

    /// <summary>Leaves (or closes) one family in its own tenant and unit of work. Returns the parents who remain.</summary>
    private static async Task<IReadOnlyList<Guid>> LeaveFamilyAsync(
        IServiceScopeFactory scopes, Guid userId, Guid familyId, Guid membershipId, FamilyRole role, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var services = scope.ServiceProvider;
        services.GetRequiredService<TenantContext>().Resolve(familyId, membershipId, role);
        var db = services.GetRequiredService<FamiliesDbContext>();
        var handlers = services.GetServices<IParentDepartureHandler>().OrderBy(h => h.Order).ToList();
        var audit = services.GetRequiredService<IAuditLog>();
        var now = services.GetRequiredService<TimeProvider>().GetUtcNow();

        var remaining = await db.Memberships
            .Where(m => m.Id != membershipId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
            .Select(m => m.UserId)
            .ToListAsync(cancellationToken);
        var closing = remaining.Count == 0;
        var departure = new ParentDeparture(familyId, membershipId, closing);

        await services.GetRequiredService<IUnitOfWork>().ExecuteAsync(async ct =>
        {
            if (closing)
            {
                foreach (var handler in handlers)
                {
                    await handler.HandleAsync(departure, ct);
                }

                await DeleteFamilyAsync(db, ct);
                await audit.RecordAsync(new AuditEntry(familyId, userId, "family.deleted", "family", familyId), ct);
                return;
            }

            var membership = await db.Memberships.SingleAsync(m => m.Id == membershipId, ct);
            membership.Status = MembershipStatus.Left;
            foreach (var device in await db.Devices
                         .Where(d => d.Kind == DeviceKind.Household && d.CreatedByMembershipId == membershipId && d.RevokedAt == null)
                         .ToListAsync(ct))
            {
                device.Revoke(now);
            }

            foreach (var invitation in await db.Invitations
                         .Where(i => i.InvitedByUserId == userId && i.AcceptedAt == null && i.RevokedAt == null)
                         .ToListAsync(ct))
            {
                invitation.Revoke(now);
            }

            // The invitation they accepted holds their email address; it isn't needed once they've gone.
            db.Invitations.RemoveRange(await db.Invitations.Where(i => i.AcceptedByUserId == userId).ToListAsync(ct));

            await db.SaveChangesAsync(ct);
            foreach (var handler in handlers)
            {
                await handler.HandleAsync(departure, ct);
            }

            await audit.RecordAsync(new AuditEntry(familyId, userId, "family.parent_left", "membership", membershipId), ct);
        }, cancellationToken);

        return remaining;
    }

    /// <summary>Everything the Families module keeps for this family (the tenant filter scopes every query to it).</summary>
    private static async Task DeleteFamilyAsync(FamiliesDbContext db, CancellationToken cancellationToken)
    {
        db.PairingCodes.RemoveRange(await db.PairingCodes.ToListAsync(cancellationToken));
        db.ChildCredentials.RemoveRange(await db.ChildCredentials.ToListAsync(cancellationToken));
        db.Devices.RemoveRange(await db.Devices.ToListAsync(cancellationToken));
        db.Children.RemoveRange(await db.Children.ToListAsync(cancellationToken));
        db.Invitations.RemoveRange(await db.Invitations.ToListAsync(cancellationToken));
        db.Memberships.RemoveRange(await db.Memberships.ToListAsync(cancellationToken));
        db.Families.RemoveRange(await db.Families.ToListAsync(cancellationToken));
        await db.SaveChangesAsync(cancellationToken);
    }
}
