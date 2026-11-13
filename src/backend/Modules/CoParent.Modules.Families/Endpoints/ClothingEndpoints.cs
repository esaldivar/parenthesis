using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record ClothingValues(string? TopSize, string? BottomSize, string? ShoeSize, string? FitNotes)
{
    public static ClothingValues From(ClothingRevision? row) =>
        new(row?.TopSize, row?.BottomSize, row?.ShoeSize, row?.FitNotes);
}

internal sealed record ClothingView(int Revision, ClothingValues Values)
{
    public static ClothingView From(ClothingRevision? row) => new(row?.Revision ?? 0, ClothingValues.From(row));
}

internal sealed record SaveClothingRequest(int? Revision, ClothingValues? Values);

internal static class ClothingEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var clothing = family.MapGroup("/children/{childId:guid}/essentials/clothing").WithTags("Child Essentials");
        clothing.MapGet("", GetAsync);
        clothing.MapPut("", SaveAsync);
        clothing.MapGet("/history", HistoryAsync);
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

        return TypedResults.Ok(ClothingView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveClothingRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
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
        var values = new ClothingValues(
            ChildEssentialsAccess.Normalize(request.Values.TopSize, "topSize", ClothingRevision.SizeLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.BottomSize, "bottomSize", ClothingRevision.SizeLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.ShoeSize, "shoeSize", ClothingRevision.SizeLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.FitNotes, "fitNotes", ClothingRevision.NotesLimit, errors));
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

            var current = ClothingView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new ClothingRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                TopSize = values.TopSize,
                BottomSize = values.BottomSize,
                ShoeSize = values.ShoeSize,
                FitNotes = values.FitNotes,
            };
            db.ClothingRevisions.Add(next);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Clothing, next.Revision,
                EssentialsUpdateEndpoints.Changed(
                ("topSize", current.Values.TopSize, values.TopSize),
                ("bottomSize", current.Values.BottomSize, values.BottomSize),
                ("shoeSize", current.Values.ShoeSize, values.ShoeSize),
                ("fitNotes", current.Values.FitNotes, values.FitNotes)),
                next.EditedAt, ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ClothingView.From(next));
        }, cancellationToken);
    }

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), ClothingValues.From, cancellationToken);

    private static IQueryable<ClothingRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.ClothingRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
