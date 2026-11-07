using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record RoutinesValues(string? Bedtime, string? Naps)
{
    public static RoutinesValues From(RoutinesRevision? row) =>
        new(row?.Bedtime, row?.Naps);
}

internal sealed record RoutinesView(int Revision, RoutinesValues Values)
{
    public static RoutinesView From(RoutinesRevision? row) => new(row?.Revision ?? 0, RoutinesValues.From(row));
}

internal sealed record SaveRoutinesRequest(int? Revision, RoutinesValues? Values);

internal static class RoutinesEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var routines = family.MapGroup("/children/{childId:guid}/essentials/routines").WithTags("Child Essentials");
        routines.MapGet("", GetAsync);
        routines.MapPut("", SaveAsync);
        routines.MapGet("/history", HistoryAsync);
        HouseholdRoutinesEndpoints.Map(routines);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(RoutinesView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveRoutinesRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUnitOfWork unitOfWork, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision is null or < 0 || request.Values is null)
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var values = new RoutinesValues(
            ChildEssentialsAccess.Normalize(request.Values.Bedtime, "bedtime", RoutinesRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.Naps, "naps", RoutinesRevision.TextLimit, errors));
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await unitOfWork.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = RoutinesView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new RoutinesRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                Bedtime = values.Bedtime,
                Naps = values.Naps,
            };
            db.RoutinesRevisions.Add(next);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Routines, next.Revision,
                EssentialsUpdateEndpoints.Changed(
                ("bedtime", current.Values.Bedtime, values.Bedtime),
                ("naps", current.Values.Naps, values.Naps)),
                next.EditedAt, ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(RoutinesView.From(next));
        }, cancellationToken);
    }

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), RoutinesValues.From, cancellationToken);

    private static IQueryable<RoutinesRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.RoutinesRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId && row.OwnerMembershipId == Guid.Empty)
            .OrderByDescending(row => row.Revision);
}
