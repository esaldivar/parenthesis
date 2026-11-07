using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.SharedRecords;

/// <summary>Parent-only records of shared funds.</summary>
public static class SharedRecordsModule
{
    public static IServiceCollection AddSharedRecordsModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<SharedRecordsDbContext>();
        services.AddScoped<IApprovalTargetHandler, FundApproval>();
        services.AddScoped<IParentDepartureHandler, SharedRecordsDeparture>();
        return services;
    }

    public static void MapSharedRecordsEndpoints(this IEndpointRouteBuilder family)
    {
        var funds = family.MapGroup("/shared-funds").WithTags("Shared Funds");
        funds.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            var tenant = context.HttpContext.RequestServices.GetRequiredService<ITenantContext>();
            return tenant.Role == FamilyRole.Parent ? await next(context) : TypedResults.NotFound();
        });
        funds.MapGet("/", ListAsync);
        funds.MapPost("/", ProposeAsync);
    }

    private static async Task<IResult> ListAsync(SharedRecordsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        var records = await db.Funds.AsNoTracking()
            .Where(f => f.ProposerId == tenant.MembershipId || f.CoParentId == tenant.MembershipId)
            .OrderByDescending(f => f.CreatedAt)
            .ThenBy(f => f.Id)
            .Select(f => new
            {
                f.Id,
                f.Title,
                f.Currency,
                f.ProposerShareMinor,
                f.CoParentShareMinor,
                f.ChildIds,
                f.ProposerId,
                f.CoParentId,
                f.CreatedAt,
                f.Status,
                f.ApprovalId,
            })
            .ToListAsync(ct);
        return TypedResults.Ok(records);
    }

    private static async Task<IResult> ProposeAsync(
        Proposal proposal, HttpContext http, [AsParameters] ProposalServices services, CancellationToken ct)
    {
        var title = proposal.Title?.Trim();
        if (string.IsNullOrEmpty(title) || title.Length > Fund.TitleLimit
            || proposal.Currency is not ("USD" or "CAD" or "MXN")
            || proposal.ProposerShareMinor is not (>= 0 and <= Fund.ShareLimit)
            || proposal.CoParentShareMinor is not (>= 0 and <= Fund.ShareLimit)
            || (proposal.ProposerShareMinor == 0 && proposal.CoParentShareMinor == 0))
        {
            return TypedResults.BadRequest("Enter a title, a supported currency, and both shares with a positive total.");
        }

        var parents = await services.Roster.ActiveParentMembershipIdsAsync(ct);
        if (parents.Count != 2 || !parents.Contains(services.Tenant.MembershipId))
        {
            return TypedResults.Conflict("Two active parents are required to propose a shared fund.");
        }

        var children = proposal.ChildIds?.Distinct().ToArray() ?? [];
        if (children.Length > 0 && !children.All((await services.Roster.ActiveChildIdsAsync(ct)).Contains))
        {
            return TypedResults.BadRequest("Select children from the current family.");
        }

        var fund = new Fund
        {
            FamilyId = services.Tenant.FamilyId,
            ProposerId = services.Tenant.MembershipId,
            CoParentId = parents.Single(id => id != services.Tenant.MembershipId),
            Title = title,
            Currency = proposal.Currency,
            ProposerShareMinor = proposal.ProposerShareMinor.Value,
            CoParentShareMinor = proposal.CoParentShareMinor.Value,
            ChildIds = children,
            CreatedAt = services.Clock.GetUtcNow(),
        };
        await services.UnitOfWork.ExecuteAsync(async transactionCt =>
        {
            fund.ApprovalId = await services.Requests.ProposeAsync(
                new ChangeRequestProposal(FundApproval.RequestType, "SharedFund", fund.Id, "Shared Fund proposal",
                    fund.ProposerId, http.User.GetUserId()!.Value), transactionCt);
            services.Db.Funds.Add(fund);
            await services.Db.SaveChangesAsync(transactionCt);
        }, ct);
        return TypedResults.Ok(new { fund.Id, fund.ApprovalId, fund.Status });
    }

    internal sealed record Proposal(string? Title, string? Currency, long? ProposerShareMinor, long? CoParentShareMinor, Guid[]? ChildIds);

    internal sealed record ProposalServices(
        SharedRecordsDbContext Db, ITenantContext Tenant, IFamilyRoster Roster,
        IChangeRequests Requests, IUnitOfWork UnitOfWork, TimeProvider Clock);
}
