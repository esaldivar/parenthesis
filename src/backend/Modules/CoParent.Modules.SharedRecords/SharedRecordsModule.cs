using System.Threading.RateLimiting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Accounts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.SharedRecords;

/// <summary>Parent-only Shared Funds and Child Support records (#477).</summary>
public static class SharedRecordsModule
{
    public static IServiceCollection AddSharedRecordsModule(this IServiceCollection services)
    {
        services.AddModuleDbContext<SharedRecordsDbContext>();
        services.AddScoped<IApprovalTargetHandler, FundApproval>();
        services.AddScoped<IParentDepartureHandler, SharedRecordsDeparture>();
        services.AddOptions<AttachmentOptions>().BindConfiguration(AttachmentOptions.Section);
        services.AddSingleton<IAttachmentStore, AzureBlobAttachmentStore>();
        // Each report uploads a file of up to 10 MB, so each parent gets a bounded hourly allowance.
        services.Configure<RateLimiterOptions>(options => options.AddPolicy(RecordEndpoints.UploadRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.GetUserId()?.ToString() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromHours(1) })));
        return services;
    }

    public static void MapSharedRecordsEndpoints(this IEndpointRouteBuilder family)
    {
        var funds = ParentsOnly(family.MapGroup("/shared-funds").WithTags("Shared Funds"));
        var support = ParentsOnly(family.MapGroup("/child-support").WithTags("Child Support"));
        var records = ParentsOnly(family.MapGroup("/shared-records").WithTags("Shared records"));
        funds.MapGet("/", ListAsync);
        funds.MapPost("/", ProposeAsync);
        RecordEndpoints.Map(funds, support, records);
    }

    /// <summary>Only parents reach these routes; anyone else is told there's nothing here. Nothing is cached.</summary>
    private static RouteGroupBuilder ParentsOnly(RouteGroupBuilder group)
    {
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            var tenant = context.HttpContext.RequestServices.GetRequiredService<ITenantContext>();
            return tenant.Role == FamilyRole.Parent ? await next(context) : TypedResults.NotFound();
        });
        return group;
    }

    private static async Task<IResult> ListAsync(SharedRecordsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        var funds = await db.Funds.AsNoTracking()
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
        var entries = await RecordEndpoints.EntriesAsync(db, tenant.MembershipId, funds.Select(f => f.Id).ToList(), ct);
        return TypedResults.Ok(funds.Select(f =>
        {
            var list = entries[f.Id].ToList();
            return new
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
                Entries = list,
                Totals = RecordEndpoints.TotalsOf(list),
            };
        }));
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
