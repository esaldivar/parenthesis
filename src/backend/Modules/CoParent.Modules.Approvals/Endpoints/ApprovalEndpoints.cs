using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Approvals.Domain;
using CoParent.Modules.Approvals.Infrastructure;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Approvals.Endpoints;

internal sealed record DecisionRequest(string? Comment);

internal sealed record DecisionView(Guid DeciderMembershipId, string Decision, string? Comment, DateTimeOffset DecidedAt);

internal sealed record ChangeRequestView(
    Guid Id,
    string Type,
    string TargetType,
    Guid TargetId,
    string Summary,
    string? Reason,
    string Status,
    Guid ProposerMembershipId,
    DateTimeOffset CreatedAt,
    int Approvals,
    int RequiredApprovals,
    bool CanDecide,
    bool ProposedByYou,
    DateTimeOffset? ResolvedAt,
    IReadOnlyList<DecisionView> Decisions);

/// <summary>The approvals inbox and decisions (ADR-0003). Parents only; children never see approvals.</summary>
internal static class ApprovalEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var approvals = family.MapGroup("/approvals").WithTags("Approvals");
        approvals.MapGet("/", ListPendingAsync);
        approvals.MapPost(
            "/{requestId:guid}/approve",
            (Guid requestId, DecisionRequest? body, [AsParameters] DecisionServices s, CancellationToken ct) =>
                DecideAsync(requestId, Decision.Approve, body?.Comment, s, ct));
        approvals.MapPost(
            "/{requestId:guid}/reject",
            (Guid requestId, DecisionRequest? body, [AsParameters] DecisionServices s, CancellationToken ct) =>
                DecideAsync(requestId, Decision.Reject, body?.Comment, s, ct));
        approvals.MapPost("/{requestId:guid}/withdraw", WithdrawAsync);
    }

    /// <summary>The inbox: pending requests (default), or <c>?view=history</c> for the 50 most recently decided.</summary>
    private static async Task<Results<Ok<List<ChangeRequestView>>, ForbidHttpResult>> ListPendingAsync(
        string? view,
        ITenantContext tenant,
        ApprovalsDbContext db,
        IEnumerable<IApprovalTargetHandler> handlers,
        IApprovalParticipants participants,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var parents = await participants.CountActiveParentsAsync(cancellationToken);
        var pending = view == "history"
            ? await db.ChangeRequests
                .Where(r => r.Status != ChangeRequestStatus.Pending)
                .OrderByDescending(r => r.ResolvedAt)
                .Take(50)
                .ToListAsync(cancellationToken)
            : await db.ChangeRequests
                .Where(r => r.Status == ChangeRequestStatus.Pending)
                .OrderBy(r => r.CreatedAt)
                .ToListAsync(cancellationToken);
        return TypedResults.Ok(pending.Select(r => View(r, tenant.MembershipId, Required(r, handlers, parents))).ToList());
    }

    private static async Task<Results<Ok<ChangeRequestView>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> DecideAsync(
        Guid requestId, Decision decision, string? comment, DecisionServices s, CancellationToken cancellationToken)
    {
        if (s.Tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
        if (comment?.Length > ApprovalDecision.CommentMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["comment"] = [$"Keep the comment under {ApprovalDecision.CommentMaxLength} characters."],
            });
        }

        var request = await s.Db.ChangeRequests.SingleOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (request is null)
        {
            return TypedResults.NotFound();
        }

        if (request.Status != ChangeRequestStatus.Pending)
        {
            return TypedResults.Problem(title: "This request has already been decided.", statusCode: StatusCodes.Status409Conflict);
        }

        if (request.ProposerMembershipId == s.Tenant.MembershipId
            || request.Decisions.Any(d => d.DeciderMembershipId == s.Tenant.MembershipId))
        {
            return TypedResults.Problem(
                title: "You've already given your answer on this request.",
                detail: "Proposing counts as your approval. The other parent decides.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var handler = s.Handlers.Single(h => h.Type == request.Type);
        var parents = await s.Participants.CountActiveParentsAsync(cancellationToken);
        var now = s.Clock.GetUtcNow();
        var userId = s.Http.User.GetUserId();
        var target = new ApprovalTarget(request.Id, request.FamilyId, request.TargetType, request.TargetId);

        try
        {
            await s.UnitOfWork.ExecuteAsync(async ct =>
            {
                // Added through the DbSet: ids are generated up front, so via the navigation EF would treat it as an
                // existing row. Relationship fix-up still adds it to request.Decisions.
                s.Db.Decisions.Add(new ApprovalDecision
                {
                    ChangeRequestId = request.Id,
                    DeciderMembershipId = s.Tenant.MembershipId,
                    Decision = decision,
                    DecidedAt = now,
                    Comment = comment,
                });

                if (decision == Decision.Reject)
                {
                    request.Resolve(ChangeRequestStatus.Rejected, now);
                    await handler.RejectAsync(target, ct);
                }
                else if (request.Approvals >= Required(request, s.Handlers, parents))
                {
                    request.Resolve(ChangeRequestStatus.Approved, now);
                    await handler.ApplyAsync(target, ct);
                }

                await s.Db.SaveChangesAsync(ct);
                var action = decision == Decision.Reject ? "change_request.rejected" : "change_request.approved";
                await s.Audit.RecordAsync(new AuditEntry(request.FamilyId, userId, action, "change_request", request.Id), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return TypedResults.Problem(
                title: "Someone else just answered this request.", detail: "Refresh to see its current state.", statusCode: StatusCodes.Status409Conflict);
        }

        return TypedResults.Ok(View(request, s.Tenant.MembershipId, Required(request, s.Handlers, parents)));
    }

    /// <summary>The proposer can take a pending request back.</summary>
    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> WithdrawAsync(
        Guid requestId, [AsParameters] DecisionServices s, CancellationToken cancellationToken)
    {
        var request = await s.Db.ChangeRequests.SingleOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (request is null || request.ProposerMembershipId != s.Tenant.MembershipId)
        {
            return TypedResults.NotFound();
        }

        if (request.Status != ChangeRequestStatus.Pending)
        {
            return TypedResults.Problem(title: "This request has already been decided.", statusCode: StatusCodes.Status409Conflict);
        }

        var handler = s.Handlers.Single(h => h.Type == request.Type);
        await s.UnitOfWork.ExecuteAsync(async ct =>
        {
            request.Resolve(ChangeRequestStatus.Withdrawn, s.Clock.GetUtcNow());
            await handler.RejectAsync(new ApprovalTarget(request.Id, request.FamilyId, request.TargetType, request.TargetId), ct);
            await s.Db.SaveChangesAsync(ct);
            await s.Audit.RecordAsync(
                new AuditEntry(request.FamilyId, s.Http.User.GetUserId(), "change_request.withdrawn", "change_request", request.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Every active parent must approve, and never fewer than the target type's minimum.</summary>
    private static int Required(ChangeRequest request, IEnumerable<IApprovalTargetHandler> handlers, int parents) =>
        Math.Max(parents, handlers.Single(h => h.Type == request.Type).MinimumApprovals);

    private static ChangeRequestView View(ChangeRequest r, Guid membershipId, int required) => new(
        r.Id,
        r.Type,
        r.TargetType,
        r.TargetId,
        r.Summary,
        r.Reason,
        r.Status.ToString(),
        r.ProposerMembershipId,
        r.CreatedAt,
        r.Approvals,
        required,
        CanDecide: r.Status == ChangeRequestStatus.Pending
            && r.ProposerMembershipId != membershipId
            && r.Decisions.All(d => d.DeciderMembershipId != membershipId),
        ProposedByYou: r.ProposerMembershipId == membershipId,
        r.ResolvedAt,
        r.Decisions.OrderBy(d => d.DecidedAt)
            .Select(d => new DecisionView(d.DeciderMembershipId, d.Decision.ToString(), d.Comment, d.DecidedAt))
            .ToList());
}

/// <summary>The services a decision needs, bound from DI in one parameter.</summary>
internal sealed record DecisionServices(
    HttpContext Http,
    ITenantContext Tenant,
    ApprovalsDbContext Db,
    IEnumerable<IApprovalTargetHandler> Handlers,
    IApprovalParticipants Participants,
    IUnitOfWork UnitOfWork,
    IAuditLog Audit,
    TimeProvider Clock);
