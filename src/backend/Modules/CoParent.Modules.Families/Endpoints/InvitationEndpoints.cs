using System.Net.Mail;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record SendInvitationRequest(string? Email);

internal sealed record InvitationSummary(Guid Id, string Email, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

internal sealed record AcceptInvitationRequest(string? Token, bool ConfirmSeparateFamily = false);

/// <summary>Co-parent invitations (FM-03, ADR-0006).</summary>
internal static class InvitationEndpoints
{
    public const string RateLimitPolicy = "invitations";

    /// <summary>Two equal parents: invitations stop once a family has both.</summary>
    public const int MaxParents = 2;

    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        var invitations = family.MapGroup("/invitations").WithTags("Invitations");
        invitations.MapPost("/", SendAsync).RequireRateLimiting(RateLimitPolicy);
        invitations.MapGet("/", ListAsync);
        invitations.MapDelete("/{invitationId:guid}", RevokeAsync);

        api.MapPost("/invitations/accept", AcceptAsync).WithTags("Invitations").RequireRateLimiting(RateLimitPolicy);
    }

    /// <summary>
    /// Always answers "sent" for a valid address, whether or not it has an account: only the invitee's email differs
    /// ("join" vs "sign up"), so the invite box can't be used to find out who uses Parenthesis.
    /// </summary>
    private static async Task<Results<Accepted<InvitationSummary>, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> SendAsync(
        SendInvitationRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUserDirectory directory,
        InvitationEmails emails,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var email = request.Email?.Trim() ?? "";
        if (email.Length is 0 or > Invitation.EmailMaxLength || !MailAddress.TryCreate(email, out _))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter a valid email address."] });
        }

        var userId = http.User.GetUserId()!.Value;
        var inviter = await directory.FindByIdAsync(userId, cancellationToken);
        if (inviter is not null && Invitation.Normalize(inviter.Email) == Invitation.Normalize(email))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter your co-parent's email address, not your own."] });
        }

        var parents = await db.Memberships.CountAsync(
            m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, cancellationToken);
        if (parents >= MaxParents)
        {
            return TypedResults.Problem(
                title: "This family already has two parents.",
                detail: "Each family has two parents with equal say, so no more co-parents can be invited.",
                statusCode: StatusCodes.Status409Conflict);
        }

        // Read everything the email needs first: once the unit of work commits, its transaction is finished.
        var familyName = await db.Families.Select(f => f.Name).SingleAsync(cancellationToken);
        var invitee = await directory.FindByEmailAsync(email, cancellationToken);

        var now = clock.GetUtcNow();
        var normalized = Invitation.Normalize(email);
        var (token, hash) = Invitation.NewToken();
        var invitation = new Invitation
        {
            FamilyId = tenant.FamilyId,
            Email = email,
            NormalizedEmail = normalized,
            TokenHash = hash,
            InvitedByUserId = userId,
            CreatedAt = now,
            ExpiresAt = now + Invitation.Lifetime,
        };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            // Re-inviting the same address replaces the earlier link, so only the newest one works.
            var earlier = await db.Invitations
                .Where(i => i.NormalizedEmail == normalized && i.AcceptedAt == null && i.RevokedAt == null)
                .ToListAsync(ct);
            earlier.ForEach(i => i.Revoke(now));
            db.Invitations.Add(invitation);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "invitation.sent", "invitation", invitation.Id), ct);
        }, cancellationToken);

        await emails.SendAsync(
            email, inviter?.DisplayName ?? "Your co-parent", familyName, token, hasAccount: invitee is not null, cancellationToken);

        return TypedResults.Accepted(
            $"/api/families/{tenant.FamilyId}/invitations",
            new InvitationSummary(invitation.Id, invitation.Email, invitation.CreatedAt, invitation.ExpiresAt));
    }

    private static async Task<Results<Ok<List<InvitationSummary>>, ForbidHttpResult>> ListAsync(
        ITenantContext tenant, FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var now = clock.GetUtcNow();
        var pending = await db.Invitations
            .Where(i => i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now)
            .OrderBy(i => i.CreatedAt)
            .Select(i => new InvitationSummary(i.Id, i.Email, i.CreatedAt, i.ExpiresAt))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(pending);
    }

    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> RevokeAsync(
        Guid invitationId,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var invitation = await db.Invitations.SingleOrDefaultAsync(i => i.Id == invitationId, cancellationToken);
        if (invitation is null)
        {
            return TypedResults.NotFound();
        }

        var userId = http.User.GetUserId()!.Value;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            invitation.Revoke(clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "invitation.revoked", "invitation", invitation.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// The signed-in invitee accepts. Families are never merged (ADR-0006): someone who is already a parent in another
    /// family is told so, and joins this one only after confirming it is a separate family (e.g. a blended family).
    /// </summary>
    private static async Task<Results<Ok<FamilySummary>, ProblemHttpResult>> AcceptAsync(
        AcceptInvitationRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IUserDirectory directory,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var invalid = TypedResults.Problem(
            title: "This invitation isn't valid any more.",
            detail: "It may have expired, been used, or been replaced by a newer one. Ask your co-parent to send it again.",
            statusCode: StatusCodes.Status404NotFound);
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return invalid;
        }

        var now = clock.GetUtcNow();
        var hash = Invitation.Hash(request.Token);

        // The invitation's family isn't known until the token is looked up, so this read crosses tenants by design,
        // constrained to the exact token hash.
        var invitation = await db.Invitations
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .SingleOrDefaultAsync(i => i.TokenHash == hash, cancellationToken);
        if (invitation is null || !invitation.IsPending(now))
        {
            return invalid;
        }

        var userId = http.User.GetUserId()!.Value;
        var user = await directory.FindByIdAsync(userId, cancellationToken);
        if (user is null || Invitation.Normalize(user.Email) != invitation.NormalizedEmail)
        {
            return TypedResults.Problem(
                title: "This invitation was sent to a different email address.",
                detail: "Sign in with the email address the invitation was sent to.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        var memberships = await db.Memberships
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active)
            .ToListAsync(cancellationToken);
        var family = await db.Families
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .SingleAsync(f => f.Id == invitation.FamilyId, cancellationToken);

        if (memberships.Any(m => m.FamilyId == invitation.FamilyId))
        {
            return TypedResults.Problem(
                title: "You're already a member of this family.",
                statusCode: StatusCodes.Status409Conflict);
        }

        if (memberships.Any(m => m.Role == FamilyRole.Parent) && !request.ConfirmSeparateFamily)
        {
            var problem = TypedResults.Problem(
                title: "You already have a family on Parenthesis.",
                detail: "Families are never merged. If your existing family is for the same children, leave it first, "
                    + "then accept this invitation. If it's a different family, confirm to join both separately.",
                statusCode: StatusCodes.Status409Conflict,
                type: "https://parenthesis.app/problems/existing-family");
            return problem;
        }

        var parents = await db.Memberships
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .CountAsync(
                m => m.FamilyId == invitation.FamilyId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active,
                cancellationToken);
        if (parents >= MaxParents)
        {
            return TypedResults.Problem(
                title: "This family already has two parents.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var membership = new FamilyMembership
        {
            FamilyId = invitation.FamilyId,
            UserId = userId,
            Role = FamilyRole.Parent,
            JoinedAt = now,
        };
        var accepted = false;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            // Share the family-row lock with account deletion. Recheck under the lock:
            // the family may have been deleted or another parent may have joined.
            var exists = await db.Database.SqlQuery<int>(
                $"SELECT 1 AS \"Value\" FROM families.families WHERE id = {invitation.FamilyId} FOR UPDATE")
                .ToListAsync(ct);
            if (exists.Count == 0)
            {
                return;
            }
            var activeParents = await db.Memberships
                .IgnoreQueryFilters([TenantContext.QueryFilterName])
                .CountAsync(m => m.FamilyId == invitation.FamilyId &&
                    m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, ct);
            if (activeParents >= MaxParents)
            {
                return;
            }
            var occupiedSlot = await db.Memberships
                .IgnoreQueryFilters([TenantContext.QueryFilterName])
                .Where(m => m.FamilyId == invitation.FamilyId &&
                    m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
                .Select(m => m.PaletteSlot)
                .SingleOrDefaultAsync(ct);
            membership.PaletteSlot = occupiedSlot == 0 ? 1 : 0;
            // The invitee is joining this family, so the request acts in it from here on.
            tenant.Resolve(invitation.FamilyId, membership.Id, FamilyRole.Parent);
            invitation.Accept(userId, now);
            db.Memberships.Add(membership);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(invitation.FamilyId, userId, "invitation.accepted", "invitation", invitation.Id), ct);
            accepted = true;
        }, cancellationToken);

        if (!accepted)
        {
            return TypedResults.Problem(
                title: "This invitation is no longer available.",
                detail: "The family was deleted or already has two parents.",
                statusCode: StatusCodes.Status409Conflict);
        }
        return TypedResults.Ok(new FamilySummary(family.Id, family.Name, family.TimeZone, FamilyRole.Parent));
    }
}
