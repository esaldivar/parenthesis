using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
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

internal sealed record AddChildRequest(string? FirstName);

internal sealed record ChildView(Guid Id, string FirstName, ChildStatus Status, Guid? ChangeRequestId, ChildSignInView SignIn);

/// <summary>A child's sign-in, for parents: whether a PIN is set, whether it's locked, and whether a new PIN awaits approval.</summary>
/// <summary>
/// A child's sign-in state. <c>Locked</c>: the PIN needs a parent to reset it (#153). <c>PausedUntil</c>: set while
/// three wrong PINs have paused it; it reopens on its own then.
/// </summary>
internal sealed record ChildSignInView(bool Enabled, bool Locked, bool PinChangePending, DateTimeOffset? PausedUntil = null)
{
    public static readonly ChildSignInView None = new(false, false, false);
}

/// <summary>Children (FM-04, ADR-0006). A child only becomes usable once both parents approve.</summary>
internal static class ChildEndpoints
{
    /// <summary>A generous upper bound that still stops runaway or accidental bulk creation.</summary>
    public const int MaxChildren = 12;

    public static void Map(IEndpointRouteBuilder family)
    {
        var children = family.MapGroup("/children").WithTags("Children");
        children.MapPost("/", AddAsync);
        children.MapGet("/", ListAsync);
    }

    /// <summary>
    /// Either parent can add a child; it's created as pending with a ChildCreate request for the other parent. Setup's
    /// "household size" step calls this once per child.
    /// </summary>
    private static async Task<Results<Created<ChildView>, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> AddAsync(
        AddChildRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IChangeRequests changeRequests,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var firstName = request.FirstName?.Trim() ?? "";
        if (firstName.Length is 0 or > ChildProfile.FirstNameMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["firstName"] = [$"Enter the child's first name (1 to {ChildProfile.FirstNameMaxLength} characters)."],
            });
        }

        var existing = await db.Children.CountAsync(
            c => c.Status == ChildStatus.Active || c.Status == ChildStatus.PendingApproval, cancellationToken);
        if (existing >= MaxChildren)
        {
            return TypedResults.Problem(
                title: $"A family can have up to {MaxChildren} children here.", statusCode: StatusCodes.Status409Conflict);
        }

        var userId = http.User.GetUserId()!.Value;
        var child = new ChildProfile
        {
            FamilyId = tenant.FamilyId,
            FirstName = firstName,
            CreatedByMembershipId = tenant.MembershipId,
            CreatedAt = clock.GetUtcNow(),
        };

        Guid changeRequestId = default;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.Children.Add(child);
            await db.SaveChangesAsync(ct);
            changeRequestId = await changeRequests.ProposeAsync(
                new ChangeRequestProposal(
                    ChangeRequestTypes.ChildCreate, "child", child.Id, $"Add {firstName} to the family", tenant.MembershipId, userId),
                ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "child.proposed", "child", child.Id), ct);
        }, cancellationToken);

        return TypedResults.Created(
            $"/api/families/{tenant.FamilyId}/children/{child.Id}",
            new ChildView(child.Id, child.FirstName, child.Status, changeRequestId, ChildSignInView.None));
    }

    /// <summary>Active and pending children, with their sign-in state; rejected or archived ones drop out of the list.</summary>
    private static async Task<Results<Ok<List<ChildView>>, ForbidHttpResult>> ListAsync(
        ITenantContext tenant, FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var children = await db.Children
            .Where(c => c.Status == ChildStatus.Active || c.Status == ChildStatus.PendingApproval)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(cancellationToken);
        var childIds = children.Select(c => c.Id).ToList();
        var credentials = await db.ChildCredentials
            .Where(c => childIds.Contains(c.ChildProfileId))
            .ToDictionaryAsync(c => c.ChildProfileId, cancellationToken);

        return TypedResults.Ok(children
            .Select(c => new ChildView(
                c.Id,
                c.FirstName,
                c.Status,
                null,
                credentials.TryGetValue(c.Id, out var credential)
                    ? new ChildSignInView(
                        true,
                        credential.IsLocked,
                        credential.PendingPinHash is not null,
                        credential.StateAt(clock.GetUtcNow()) == PinState.Paused ? credential.PausedUntil : null)
                    : ChildSignInView.None))
            .ToList());
    }
}
